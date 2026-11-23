package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

const (
	cfUnicodeText = 13
	gmMoveable    = 0x0002
)

var (
	user32              = syscall.NewLazyDLL("user32.dll")
	kernel32            = syscall.NewLazyDLL("kernel32.dll")
	openClipboard       = user32.NewProc("OpenClipboard")
	emptyClipboard      = user32.NewProc("EmptyClipboard")
	setClipboard        = user32.NewProc("SetClipboardData")
	closeClipboard      = user32.NewProc("CloseClipboard")
	globalAlloc         = kernel32.NewProc("GlobalAlloc")
	globalLock          = kernel32.NewProc("GlobalLock")
	globalUnlock        = kernel32.NewProc("GlobalUnlock")
	globalFree          = kernel32.NewProc("GlobalFree")
	moveMemory          = kernel32.NewProc("RtlMoveMemory")
	setWindowsHookEx    = user32.NewProc("SetWindowsHookExW")
	unhookWindowsHookEx = user32.NewProc("UnhookWindowsHookEx")
	callNextHookEx      = user32.NewProc("CallNextHookEx")
	getForegroundWindow = user32.NewProc("GetForegroundWindow")
	getClassName        = user32.NewProc("GetClassNameW")
	getMessage          = user32.NewProc("GetMessageW")
)

var copying atomic.Bool

type keyboardEvent struct {
	vkCode    uint32
	scanCode  uint32
	flags     uint32
	time      uint32
	extraInfo uintptr
}

type point struct{ x, y int32 }
type message struct {
	hwnd    uintptr
	msg     uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      point
	private uint32
}

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--hotkey" {
		runHotkey()
		return
	}
	if len(os.Args) != 2 || os.Args[1] == "" {
		os.Exit(1)
	}
	if err := copyText(os.Args[1]); err != nil {
		os.Exit(1)
	}
}

func runHotkey() {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	callback := syscall.NewCallback(func(code, wParam, lParam uintptr) uintptr {
		if int32(code) >= 0 && (wParam == 0x0100 || wParam == 0x0104) {
			key := (*keyboardEvent)(unsafe.Pointer(lParam))
			if key.vkCode == 0x71 && key.flags&0x20 != 0 && explorerForeground() {
				if copying.CompareAndSwap(false, true) {
					go func() {
						defer copying.Store(false)
						copySelectedPaths()
					}()
				}
				return 1
			}
		}
		next, _, _ := callNextHookEx.Call(0, code, wParam, lParam)
		return next
	})
	hook, _, _ := setWindowsHookEx.Call(13, callback, 0, 0) // WH_KEYBOARD_LL
	if hook == 0 {
		return
	}
	defer unhookWindowsHookEx.Call(hook)
	var msg message
	for {
		result, _, _ := getMessage.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if int32(result) <= 0 {
			return
		}
	}
}

func explorerForeground() bool {
	hwnd, _, _ := getForegroundWindow.Call()
	if hwnd == 0 {
		return false
	}
	var class [256]uint16
	n, _, _ := getClassName.Call(hwnd, uintptr(unsafe.Pointer(&class[0])), uintptr(len(class)))
	if n == 0 {
		return false
	}
	name := syscall.UTF16ToString(class[:n])
	return name == "CabinetWClass" || name == "ExploreWClass"
}

func copySelectedPaths() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	script := filepath.Join(filepath.Dir(exe), "selected-paths.ps1")
	command := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script)
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := command.Output()
	if err != nil {
		return
	}
	paths := strings.TrimRight(string(out), "\r\n")
	if paths != "" {
		_ = copyText(paths)
	}
}

func copyText(value string) error {
	chars, err := syscall.UTF16FromString(value)
	if err != nil {
		return err
	}
	var opened bool
	for i := 0; i < 10; i++ {
		if ok, _, _ := openClipboard.Call(0); ok != 0 {
			opened = true
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if !opened {
		return syscall.EINVAL
	}
	defer closeClipboard.Call()

	if ok, _, _ := emptyClipboard.Call(); ok == 0 {
		return syscall.EINVAL
	}
	size := uintptr(len(chars) * 2)
	handle, _, _ := globalAlloc.Call(gmMoveable, size)
	if handle == 0 {
		return syscall.ENOMEM
	}
	defer func() {
		if handle != 0 {
			globalFree.Call(handle)
		}
	}()
	ptr, _, _ := globalLock.Call(handle)
	if ptr == 0 {
		return syscall.EINVAL
	}
	moveMemory.Call(ptr, uintptr(unsafe.Pointer(&chars[0])), size)
	globalUnlock.Call(handle)
	if ok, _, _ := setClipboard.Call(cfUnicodeText, handle); ok == 0 {
		return syscall.EINVAL
	}
	handle = 0 // The clipboard owns the memory after SetClipboardData succeeds.
	return nil
}
