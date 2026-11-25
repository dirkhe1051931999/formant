/*******************************************************************************

    uBlock Origin Lite - a comprehensive, MV3-compliant content blocker
    Copyright (C) 2014-present Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock

*/

// Important!
// Isolate from global scope

// Start of local scope
(function uBOL_scriptletFrameworkBegin($SECRET_ID$) {

/******************************************************************************/

const scriptletGlobals = self[$SECRET_ID$] = {};

if ( typeof $SCRIPTLET_GLOBALS$ !== 'undefined' && self.$SCRIPTLET_GLOBALS$ === undefined ) {
    Object.assign(scriptletGlobals, $SCRIPTLET_GLOBALS$); // eslint-disable-line
}

/******************************************************************************/

class JSONPath {
    static create(query) {
        const jsonp = new JSONPath();
        jsonp.compile(query);
        return jsonp;
    }
    static toJSON(obj, stringifier, ...args) {
        return (stringifier || JSON.stringify)(obj, ...args)
            .replace(/\//g, '\\/');
    }
    static keys = Object.keys;
    static entries = Object.entries;
    static hasOwn = Object.hasOwn;
    static Regex = RegExp;
    get value() {
        return this.#compiled && this.#compiled.rval;
    }
    set value(v) {
        if ( this.#compiled === undefined ) { return; }
        this.#compiled.rval = v;
    }
    get valid() {
        return this.#compiled !== undefined;
    }
    compile(query) {
        this.#compiled = undefined;
        this.v2 = query.startsWith('v2:');
        if ( this.v2 ) { query = query.slice(3); }
        const r = this.#compile(query, 0);
        if ( r === undefined ) { return; }
        if ( r.i !== query.length ) {
            let val;
            if ( query.startsWith('=', r.i) ) {
                const match = this.#reRval.exec(query.slice(r.i));
                if ( match ) {
                    r.modify = match[1];
                    val = match[2];
                } else {
                    val = query.slice(r.i+1);
                }
            } else if ( query.startsWith('+=', r.i) ) {
                r.modify = '+';
                val = query.slice(r.i+2);
            }
            try { r.rval = JSON.parse(val); }
            catch { return; }
        }
        r.v2 = this.v2;
        this.#compiled = r;
    }
    evaluate(root) {
        if ( this.valid === false ) { return []; }
        this.#root = { '$': root };
        const paths = this.#evaluate(this.#compiled.steps, []);
        this.#root = null;
        return paths;
    }
    apply(root) {
        if ( this.valid === false ) { return; }
        const { rval } = this.#compiled;
        this.#root = { '$': root };
        const paths = this.#evaluate(this.#compiled.steps, []);
        let i = paths.length
        if ( i === 0 ) { this.#root = null; return; }
        while ( i-- ) {
            const { obj, key } = this.#resolvePath(paths[i]);
            if ( obj === undefined ) { continue; }
            if ( rval !== undefined ) {
                this.#modifyVal(obj, key);
            } else if ( Array.isArray(obj) && typeof key === 'number' ) {
                obj.splice(key, 1);
            } else {
                delete obj[key];
            }
        }
        const result = this.#root['$'] ?? null;
        this.#root = null;
        return result;
    }
    dump() {
        return JSON.stringify(this.#compiled);
    }
    toJSON(obj, ...args) {
        return JSONPath.toJSON(obj, null, ...args)
    }
    get [Symbol.toStringTag]() {
        return 'JSONPath';
    }
    #UNDEFINED = 0;
    #ROOT = 1;
    #CURRENT = 2;
    #CHILDREN = 3;
    #DESCENDANTS = 4;
    #QUANTIFIER = 5;
    #reUnquotedIdentifier = /^[A-Za-z_][\w]*|^\*/;
    #reExpr = /^\s*([!=^$*]=|[<>]=?)\s*(.+?)\]/;
    #reIndice = /^-?\d+/;
    #reRval = /^=([a-z]+)\((.+)\)$/;
    #reQuantifier = /^\{(\d+|\d+,\d+|\d+,|,\d+)\};\$/;
    #root;
    #compiled;
    #compile(query, i) {
        if ( query.length === 0 ) { return; }
        const steps = [];
        let c = query.charCodeAt(i);
        if ( c === 0x24 /* $ */ ) {
            steps.push({ mv: this.#ROOT });
            i += 1;
        } else if ( c === 0x40 /* @ */ ) {
            steps.push({ mv: this.#CURRENT });
            i += 1;
        } else {
            steps.push({ mv: i === 0 ? this.#ROOT : this.#CURRENT });
        }
        let mv = this.#UNDEFINED;
        for (;;) {
            if ( i === query.length ) { break; }
            c = query.charCodeAt(i);
            if ( c === 0x20 /* whitespace */ ) {
                i += 1;
                continue;
            }
            // Dot accessor syntax
            if ( c === 0x2E /* . */ ) {
                if ( mv !== this.#UNDEFINED ) { return; }
                if ( query.startsWith('..', i) ) {
                    mv = this.#DESCENDANTS;
                    i += 2;
                } else {
                    mv = this.#CHILDREN;
                    i += 1;
                }
                continue;
            }
            if ( c === 0x3B /* ; */ ) {
                if ( query.startsWith(';$', i) === false ) { return; }
                steps.push(
                    { mv: this.#QUANTIFIER, min: 1, max: 1e6 },
                    { mv: this.#ROOT }
                );
                i += 2;
                mv = this.#UNDEFINED;
                continue;
            }
            if ( c === 0x7B /* { */ ) {
                const match = this.#reQuantifier.exec(query.slice(i));
                if ( match === null ) { return; }
                const comma = match[1].indexOf(',');
                let min, max;
                if ( comma === -1 ) {
                    min = max = parseInt(match[1]);
                } else {
                    min = parseInt(match[1].slice(0, comma)) || 0;
                    max = parseInt(match[1].slice(comma+1)) || 1e6;
                }
                steps.push(
                    { mv: this.#QUANTIFIER, min, max },
                    { mv: this.#ROOT }
                );
                i += match[0].length;
                mv = this.#UNDEFINED;
                continue;
            }
            if ( c !== 0x5B /* [ */ ) {
                if ( mv === this.#UNDEFINED ) {
                    const step = steps.at(-1);
                    if ( step === undefined ) { return; }
                    const j = this.#compileExpr(query, step, i);
                    if ( j ) { i = j; }
                    break;
                }
                const r = this.#consumeUnquotedIdentifier(query, i);
                if  ( r === undefined ) { return; }
                steps.push({ mv, k: r.s });
                i = r.i;
                mv = this.#UNDEFINED;
                continue;
            }
            // Bracket accessor syntax
            if ( mv === this.#CHILDREN ) { return; }
            if ( query.startsWith('[?', i) ) {
                const not = query.charCodeAt(i+2) === 0x21 /* ! */ ? 1 : 0;
                const j = i + 2 + not;
                const r = this.#compile(query, j);
                if ( r === undefined ) { return; }
                if ( query.startsWith(']', r.i) === false ) { return; }
                if ( not ) { r.steps.at(-1).not = true; }
                steps.push({ mv: mv || this.#CHILDREN, steps: r.steps });
                i = r.i + 1;
                mv = this.#UNDEFINED;
                continue;
            }
            if ( query.startsWith('[*]', i) ) {
                mv ||= this.#CHILDREN;
                steps.push({ mv, k: '*' });
                i += 3;
                mv = this.#UNDEFINED;
                continue;
            }
            const r = this.#consumeIdentifier(query, i+1);
            if ( r === undefined ) { return; }
            mv ||= this.#CHILDREN;
            steps.push({ mv, k: r.s });
            i = r.i + 1;
            mv = this.#UNDEFINED;
        }
        if ( steps.length === 0 ) { return; }
        if ( mv !== this.#UNDEFINED ) { return; }
        return { steps, i };
    }
    #evaluate(steps, pathin) {
        let resultset = [];
        if ( Array.isArray(steps) === false ) { return resultset; }
        for ( const step of steps ) {
            switch ( step.mv ) {
            case this.#ROOT:
                resultset = [ [ '$' ] ];
                break;
            case this.#CURRENT:
                if ( step.op ) {
                    const { obj, key } = this.#resolvePath(pathin);
                    if ( obj === undefined ) { return []; }
                    const outcome = this.#evaluateExpr(step, obj, key);
                    if ( outcome !== true ) { break; }
                }
                resultset = [ pathin ];
                break;
            case this.#CHILDREN:
            case this.#DESCENDANTS: {
                if ( resultset.length === 0 ) { break; }
                resultset = this.#getMatches(resultset, step);
                break;
            }
            case this.#QUANTIFIER: {
                const { length } = resultset;
                if ( length < step.min || length > step.max ) { return []; }
                resultset = [];
                break;
            }
            default:
                break;
            }
        }
        return resultset;
    }
    #getMatches(listin, step) {
        const listout = [];
        for ( const pathin of listin ) {
            const { value: owner } = this.#resolvePath(pathin);
            if ( owner === undefined ) { continue; }
            if ( step.steps ) {
                this.#getMatchesFromExpr(pathin, step, owner, listout);
                continue;
            }
            const iter = this.#expandKey(owner, step.k);
            if ( iter ) {
                for ( const k of iter ) {
                    const outcome = this.#evaluateExpr(step, owner, k);
                    if ( outcome !== true ) { continue; }
                    listout.push([ ...pathin, k ]);
                }
            }
            if ( step.mv !== this.#DESCENDANTS ) { continue; }
            for ( const { obj, key, path } of this.#getDescendants(owner, true) ) {
                const iter = this.#expandKey(obj[key], step.k);
                if ( iter === undefined ) { continue; }
                for ( const k of iter ) {
                    const outcome = this.#evaluateExpr(step, obj[key], k);
                    if ( outcome !== true ) { continue; }
                    listout.push([ ...pathin, ...path, k ]);
                }
            }
        }
        return listout;
    }
    #expandKey(owner, k) {
        if ( typeof owner !== 'object' || owner === null ) { return; }
        if ( Array.isArray(k) ) {
            const out = [];
            for ( const a of k ) {
                const iter = this.#expandKey(owner, a);
                if ( iter === undefined ) { continue; }
                out.push(...iter);
            }
            return out;
        }
        if ( typeof k === 'number' ) {
            if ( Array.isArray(owner) === false ) { return; }
            return [ k >= 0 ? k : owner.length + k ];
        }
        if ( k === '*' ) {
            if ( Array.isArray(owner) ) { return owner.keys(); }
            return JSONPath.keys(owner);
        }
        if ( k instanceof JSONPath.Regex ) {
            const out = [];
            for ( const key of JSONPath.keys(owner) ) {
                if ( k.test(key) === false ) { continue; }
                out.push(key);
            }
            return out;
        }
        return [ k ];
    }
    #getMatchesFromExpr(pathin, step, owner, out) {
        const recursive = step.mv === this.#DESCENDANTS;
        const v2 = this.#compiled.v2 || recursive || Array.isArray(owner);
        for ( const { path } of this.#getDescendants(owner, recursive) ) {
            const q = v2 ? [ ...pathin, ...path ] : pathin;
            const r = this.#evaluate(step.steps, q);
            if ( Boolean(r?.length) === false ) { continue; }
            out.push(q);
            if ( v2 === false ) { break; }
        }
    }
    #getDescendants(v, recursive) {
        const iterator = {
            next() {
                const n = this.stack.length;
                if ( n === 0 ) {
                    this.value = undefined;
                    this.done = true;
                    return this;
                }
                const details = this.stack[n-1];
                const entry = details.keys.next();
                if ( entry.done ) {
                    this.stack.pop();
                    this.path.pop();
                    return this.next();
                }
                this.path[n-1] = entry.value;
                this.value = {
                    obj: details.obj,
                    key: entry.value,
                    path: this.path.slice(),
                };
                const v = this.value.obj[this.value.key];
                if ( recursive && typeof v === 'object' && v !== null && this.seen.has(v) === false ) {
                    if ( Array.isArray(v) ) {
                        this.stack.push({ obj: v, keys: v.keys() });
                    } else {
                        this.stack.push({ obj: v, keys: JSONPath.keys(v).values() });
                    }
                    this.seen.add(v);
                }
                return this;
            },
            path: [],
            value: undefined,
            done: false,
            stack: [],
            seen: new WeakSet(),
            [Symbol.iterator]() { return this; },
        };
        if ( Array.isArray(v) ) {
            iterator.stack.push({ obj: v, keys: v.keys() });
        } else if ( typeof v === 'object' && v !== null ) {
            iterator.stack.push({ obj: v, keys: JSONPath.keys(v).values() });
        }
        return iterator;
    }
    #consumeIdentifier(query, i) {
        const keys = [];
        let needIdentifier = true;
        while ( i < query.length ) {
            const c0 = query.charCodeAt(i);
            if ( c0 === 0x5D /* ] */ ) { break; }
            if ( c0 === 0x20 /* SPACE */ ) {
                i += 1;
                continue;
            }
            if ( c0 === 0x2C /* , */ ) {
                if ( needIdentifier ) { return; }
                i += 1;
                needIdentifier = true;
                continue;
            }
            if ( c0 === 0x22 /* " */ || c0 === 0x27 /* ' */ ) {
                const r = this.#untilChar(query, c0, i+1);
                if ( r === undefined ) { return; }
                keys.push(r.s);
                i = r.i;
                needIdentifier = false;
                continue;
            }
            if ( c0 === 0x2D /* - */ || c0 >= 0x30 && c0 <= 0x39 ) {
                const match = this.#reIndice.exec(query.slice(i));
                if ( match === null ) { return; }
                const indice = parseInt(query.slice(i), 10);
                keys.push(indice);
                i += match[0].length;
                needIdentifier = false;
                continue;
            }
            if ( this.v2 ) { return; }
            const r = this.#consumeUnquotedIdentifier(query, i);
            if ( r === undefined ) { return; }
            keys.push(r.s);
            i = r.i;
        }
        if ( needIdentifier ) { return; }
        return { s: keys.length === 1 ? keys[0] : keys, i };
    }
    #consumeUnquotedIdentifier(query, i) {
        if ( query.charCodeAt(i) === 0x2F /* / */ ) {
            const r = this.#untilChar(query, 0x2F, i+1);
            if ( r === undefined ) { return; }
            let re;
            try { re = new JSONPath.Regex(r.s); } catch { return; }
            return { s: re, i: r.i };
        }
        const match = this.#reUnquotedIdentifier.exec(query.slice(i));
        if ( match === null ) { return; }
        return { s: match[0], i: i + match[0].length };
    }
    #untilChar(query, targetCharCode, i) {
        const len = query.length;
        const parts = [];
        let beg = i, end = i;
        for (;;) {
            if ( end === len ) { return; }
            const c = query.charCodeAt(end);
            if ( c === targetCharCode ) {
                parts.push(query.slice(beg, end));
                end += 1;
                break;
            }
            if ( c === 0x5C /* \ */ && (end+1) < len ) {
                const d = query.charCodeAt(end+1);
                if ( d === targetCharCode ) {
                    parts.push(query.slice(beg, end));
                    end += 1;
                    beg = end;
                }
            }
            end += 1;
        }
        return { s: parts.join(''), i: end };
    }
    #compileExpr(query, step, i) {
        if ( query.startsWith('=/', i) ) {
            const r = this.#untilChar(query, 0x2F /* / */, i+2);
            if ( r === undefined ) { return i; }
            const match = /^[i]/.exec(query.slice(r.i));
            try {
                step.rval = new JSONPath.Regex(r.s, match && match[0] || undefined);
            } catch { return; }
            step.op = 're';
            if ( match ) { r.i += match[0].length; }
            return r.i;
        }
        const match = this.#reExpr.exec(query.slice(i));
        if ( match === null ) { return; }
        const op = match[1], rval = match[2];
        if ( rval.charCodeAt(0) === 0x27 /* ' */ ) {
            const r = this.#untilChar(rval, 0x27, 1);
            if ( r === undefined ) { return; }
            step.rval = r.s;
            step.op = op;
        } else {
            try {
                step.rval = JSON.parse(rval);
                step.op = op;
            } catch { return; }
        }
        return i + match[0].length - 1;
    }
    #resolvePath(path) {
        if ( path.length === 0 ) { return { value: this.#root }; }
        const key = path.at(-1);
        let obj = this.#root
        for ( let i = 0, n = path.length-1; i < n; i++ ) {
            obj = obj[path[i]];
            if ( obj instanceof Object === false ) { return {}; }
        }
        return { obj, key, value: obj[key] };
    }
    #evaluateExpr(step, owner, k) {
        if ( owner === undefined || owner === null ) { return; }
        const hasOwn = owner[k] !== undefined || JSONPath.hasOwn(owner, k);
        if ( step.op !== undefined && hasOwn === false ) { return; }
        const target = step.not !== true;
        const v = owner[k];
        switch ( step.op ) {
        case '==': return (v === step.rval) === target;
        case '!=': return (v !== step.rval) === target;
        case  '<': return (v < step.rval) === target;
        case '<=': return (v <= step.rval) === target;
        case  '>': return (v > step.rval) === target;
        case '>=': return (v >= step.rval) === target;
        case '^=': return `${v}`.startsWith(step.rval) === target;
        case '$=': return `${v}`.endsWith(step.rval) === target;
        case '*=': return `${v}`.includes(step.rval) === target;
        case 're': return step.rval.test(`${v}`);
        default: break;
        }
        return hasOwn === target;
    }
    #modifyVal(obj, key) {
        let { modify, rval } = this.#compiled;
        if ( typeof rval === 'string' ) {
            rval = rval.replace('${now}', `${Date.now()}`);
        }
        switch ( modify ) {
        case undefined:
            obj[key] = rval;
            break;
        case '+': {
            if ( rval instanceof Object === false ) { return; }
            const lval = obj[key];
            if ( lval instanceof Object === false ) { return; }
            if ( Array.isArray(lval) ) {
                if ( Array.isArray(rval) ) {
                    lval.push(...rval); break;
                }
                lval.push(rval); break;
            }
            for ( const [ k, v ] of JSONPath.entries(rval) ) {
                lval[k] = v;
            }
            break;
        }
        case 'call': {
            const entries = rval.slice();
            if ( entries.length < 2 ) { break; }
            entries.forEach((a, i, aa) => {
                if ( a === '${obj}' ) { aa[i] = obj; }
                else if ( a === '${key}' ) { aa[i] = key; }
                else if ( a === '${val}' ) { aa[i] = obj[key]; }
            });
            const instance = entries[0] ?? self;
            instance[entries[1]](...entries.slice(2));
            break;
        }
        case 'repl': {
            const lval = obj[key];
            if ( typeof lval !== 'string' ) { return; }
            if ( this.#compiled.re === undefined ) {
                this.#compiled.re = null;
                try {
                    this.#compiled.re = rval.regex !== undefined
                        ? new JSONPath.Regex(rval.regex, rval.flags)
                        : new JSONPath.Regex(rval.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                } catch { }
            }
            if ( this.#compiled.re === null ) { return; }
            obj[key] = lval.replace(this.#compiled.re, rval.replacement);
            break;
        }
        default:
            break;
        }
    }
}

class RangeParser {
    constructor(s) {
        this.not = s.charAt(0) === '!';
        if ( this.not ) { s = s.slice(1); }
        if ( s === '' ) { return; }
        const pos = s.indexOf('-');
        if ( pos !== 0 ) {
            this.min = this.max = parseInt(s, 10) || 0;
        }
        if ( pos !== -1 ) {
            this.max = parseInt(s.slice(pos + 1), 10) || Number.MAX_SAFE_INTEGER;
        }
    }
    unbound() {
        return this.min === undefined && this.max === undefined;
    }
    test(v) {
        const n = Math.min(Math.max(Number(v) || 0, 0), Number.MAX_SAFE_INTEGER);
        if ( this.min === this.max ) {
            return (this.min === undefined || n === this.min) !== this.not;
        }
        if ( this.min === undefined ) {
            return (n <= this.max) !== this.not;
        }
        if ( this.max === undefined ) {
            return (n >= this.min) !== this.not;
        }
        return (n >= this.min && n <= this.max) !== this.not;
    }
}

function abortCurrentScript(...args) {
    runAtHtmlElementFn(( ) => {
        abortCurrentScriptFn(...args);
    });
}

function abortCurrentScriptFn(
    target = '',
    needle = '',
    context = ''
) {
    if ( typeof target !== 'string' ) { return; }
    if ( target === '' ) { return; }
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('abort-current-script', target, needle, context);
    const reNeedle = safe.patternToRegex(needle);
    const reContext = safe.patternToRegex(context);
    const thisScript = document.currentScript;
    const exceptionToken = getExceptionTokenFn();
    const scriptTexts = new WeakMap();
    const textContentGetter = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent').get;
    const getScriptText = elem => {
        let text = textContentGetter.call(elem);
        if ( text.trim() !== '' ) { return text; }
        if ( scriptTexts.has(elem) ) { return scriptTexts.get(elem); }
        const [ , mime, content ] = /^data:([^,]*),(.+)$/.exec(elem.src.trim()) ||
            [ '', '', '' ];
        try {
            switch ( true ) {
            case mime.endsWith(';base64'):
                text = self.atob(content);
                break;
            default:
                text = self.decodeURIComponent(content);
                break;
            }
        } catch {
        }
        scriptTexts.set(elem, text);
        return text;
    };
    const validate = ( ) => {
        const e = document.currentScript;
        if ( e instanceof HTMLScriptElement === false ) { return; }
        if ( e === thisScript ) { return; }
        if ( context !== '' && reContext.test(e.src) === false ) { return; }
        if ( safe.logLevel > 1 && context !== '' ) {
            safe.uboLog(logPrefix, `Matched src\n${e.src}`);
        }
        const scriptText = getScriptText(e);
        if ( reNeedle.test(scriptText) === false ) { return; }
        if ( safe.logLevel > 1 ) {
            safe.uboLog(logPrefix, `Matched text\n${scriptText}`);
        }
        safe.uboLog(logPrefix, 'Aborted');
        throw new ReferenceError(exceptionToken);
    };
    let currentValue = trapPropertyFn(target, {
        get: function() {
            validate();
            return currentValue;
        },
        set: function(a) {
            validate();
            currentValue = a;
        }
    }, { canThrow: true });
}

function abortOnPropertyRead(
    chain = ''
) {
    if ( typeof chain !== 'string' ) { return; }
    if ( chain === '' ) { return; }
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('abort-on-property-read', chain);
    const exceptionToken = getExceptionTokenFn();
    const abort = function() {
        safe.uboLog(logPrefix, 'Aborted');
        throw new ReferenceError(exceptionToken);
    };
    const makeProxy = function(owner, chain) {
        const pos = chain.indexOf('.');
        if ( pos === -1 ) {
            const desc = Object.getOwnPropertyDescriptor(owner, chain);
            if ( !desc || desc.get !== abort ) {
                Object.defineProperty(owner, chain, {
                    get: abort,
                    set: function(){}
                });
            }
            return;
        }
        const prop = chain.slice(0, pos);
        let v = owner[prop];
        chain = chain.slice(pos + 1);
        if ( v ) {
            makeProxy(v, chain);
            return;
        }
        const desc = Object.getOwnPropertyDescriptor(owner, prop);
        if ( desc && desc.set !== undefined ) { return; }
        Object.defineProperty(owner, prop, {
            get: function() { return v; },
            set: function(a) {
                v = a;
                if ( a instanceof Object ) {
                    makeProxy(a, chain);
                }
            }
        });
    };
    const owner = window;
    makeProxy(owner, chain);
}

function abortOnPropertyWrite(
    prop = ''
) {
    if ( typeof prop !== 'string' ) { return; }
    if ( prop === '' ) { return; }
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('abort-on-property-write', prop);
    const exceptionToken = getExceptionTokenFn();
    let owner = window;
    for (;;) {
        const pos = prop.indexOf('.');
        if ( pos === -1 ) { break; }
        owner = owner[prop.slice(0, pos)];
        if ( owner instanceof Object === false ) { return; }
        prop = prop.slice(pos + 1);
    }
    delete owner[prop];
    Object.defineProperty(owner, prop, {
        set: function() {
            safe.uboLog(logPrefix, 'Aborted');
            throw new ReferenceError(exceptionToken);
        }
    });
}

function abortOnStackTrace(
    chain = '',
    needle = '',
    ...varargs
) {
    if ( typeof chain !== 'string' ) { return; }
    const safe = safeSelf();
    const needleDetails = safe.initPattern(needle, { canNegate: true });
    const extraArgs = safe.parseVarargs(varargs);
    if ( needle === '' ) { extraArgs.log = 'all'; }
    const makeProxy = function(owner, chain) {
        const pos = chain.indexOf('.');
        if ( pos === -1 ) {
            let v = owner[chain];
            Object.defineProperty(owner, chain, {
                get: function() {
                    const log = safe.logLevel > 1 ? 'all' : 'match';
                    if ( matchesStackTraceFn(needleDetails, log) ) {
                        throw new ReferenceError(getExceptionTokenFn());
                    }
                    return v;
                },
                set: function(a) {
                    const log = safe.logLevel > 1 ? 'all' : 'match';
                    if ( matchesStackTraceFn(needleDetails, log) ) {
                        throw new ReferenceError(getExceptionTokenFn());
                    }
                    v = a;
                },
            });
            return;
        }
        const prop = chain.slice(0, pos);
        let v = owner[prop];
        chain = chain.slice(pos + 1);
        if ( v ) {
            makeProxy(v, chain);
            return;
        }
        const desc = Object.getOwnPropertyDescriptor(owner, prop);
        if ( desc && desc.set !== undefined ) { return; }
        Object.defineProperty(owner, prop, {
            get: function() { return v; },
            set: function(a) {
                v = a;
                if ( a instanceof Object ) {
                    makeProxy(a, chain);
                }
            }
        });
    };
    const owner = window;
    makeProxy(owner, chain);
}

function adjustSetInterval(
    needleArg = '',
    delayArg = '',
    boostArg = ''
) {
    if ( typeof needleArg !== 'string' ) { return; }
    const safe = safeSelf();
    const reNeedle = safe.patternToRegex(needleArg);
    let delay = delayArg !== '*' ? parseInt(delayArg, 10) : -1;
    if ( isNaN(delay) || isFinite(delay) === false ) { delay = 1000; }
    let boost = parseFloat(boostArg);
    boost = isNaN(boost) === false && isFinite(boost)
        ? Math.min(Math.max(boost, 0.001), 50)
        : 0.05;
    self.setInterval = new Proxy(self.setInterval, {
        apply: function(target, thisArg, args) {
            const [ a, b ] = args;
            if (
                (delay === -1 || b === delay) &&
                reNeedle.test(a.toString())
            ) {
                args[1] = b * boost;
            }
            return target.apply(thisArg, args);
        }
    });
}

function adjustSetTimeout(
    needleArg = '',
    delayArg = '',
    boostArg = ''
) {
    if ( typeof needleArg !== 'string' ) { return; }
    const safe = safeSelf();
    const reNeedle = safe.patternToRegex(needleArg);
    let delay = delayArg !== '*' ? parseInt(delayArg, 10) : -1;
    if ( isNaN(delay) || isFinite(delay) === false ) { delay = 1000; }
    let boost = parseFloat(boostArg);
    boost = isNaN(boost) === false && isFinite(boost)
        ? Math.min(Math.max(boost, 0.001), 50)
        : 0.05;
    self.setTimeout = new Proxy(self.setTimeout, {
        apply: function(target, thisArg, args) {
            const [ a, b ] = args;
            if (
                (delay === -1 || b === delay) &&
                reNeedle.test(a.toString())
            ) {
                args[1] = b * boost;
            }
            return target.apply(thisArg, args);
        }
    });
}

function alertBuster() {
    window.alert = new Proxy(window.alert, {
        apply: function(a) {
            console.info(a);
        },
        get(target, prop) {
            if ( prop === 'toString' ) {
                return target.toString.bind(target);
            }
            return Reflect.get(target, prop);
        },
    });
}

function collateFetchArgumentsFn(resource, options) {
    const safe = safeSelf();
    const props = [
        'body', 'cache', 'credentials', 'duplex', 'headers',
        'integrity', 'keepalive', 'method', 'mode', 'priority',
        'redirect', 'referrer', 'referrerPolicy', 'url'
    ];
    const out = {};
    if ( collateFetchArgumentsFn.collateKnownProps === undefined ) {
        collateFetchArgumentsFn.collateKnownProps = (src, out) => {
            for ( const prop of props ) {
                if ( src[prop] === undefined ) { continue; }
                out[prop] = src[prop];
            }
        };
    }
    if (
        typeof resource !== 'object' ||
        safe.Object_toString.call(resource) !== '[object Request]'
    ) {
        out.url = `${resource}`;
    } else {
        let clone;
        try {
            clone = safe.Request_clone.call(resource);
        } catch {
        }
        collateFetchArgumentsFn.collateKnownProps(clone || resource, out);
    }
    if ( typeof options === 'object' && options !== null ) {
        collateFetchArgumentsFn.collateKnownProps(options, out);
    }
    return out;
}

function disableNewtabLinks() {
    document.addEventListener('click', ev => {
        let target = ev.target;
        while ( target !== null ) {
            if ( target.localName === 'a' && target.hasAttribute('target') ) {
                ev.stopPropagation();
                ev.preventDefault();
                break;
            }
            target = target.parentNode;
        }
    }, { capture: true });
}

function editObjectOnSetter(...args) {
    editObjectOnSetterFn(false, ...args);
}

function editObjectOnSetterFn(
    trusted = false,
    propChain = '',
    jsonq = '',
) {
    if ( propChain === '' ) { return; }
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix(
        `${trusted ? 'trusted-' : ''}edit-object-on-setter`,
        propChain,
        jsonq
    );
    const jsonp = JSONPath.create(jsonq);
    if ( jsonp.valid === false || jsonp.value !== undefined && trusted !== true ) {
        return safe.uboLog(logPrefix, 'Bad JSONPath query');
    }
    const editObj = objBefore => {
        const objAfter = jsonp.apply(objBefore);
        if ( objAfter === undefined ) { return; }
        safe.uboLog(logPrefix, 'Edited');
        if ( safe.logLevel <= 1 ) { return; }
        safe.uboLog(logPrefix, `After edit:\n${safe.JSON_stringify(objAfter, null, 2)}`);
    };
    let currentValue = trapPropertyFn(propChain, {
        get: function() {
            return currentValue;
        },
        set: function(a) {
            currentValue = a;
            if ( currentValue instanceof Object ) {
                editObj(currentValue);
            }
        }
    });
    if ( currentValue instanceof Object ) {
        editObj(currentValue);
    }
}

function evaldataPrune(
    rawPrunePaths = '',
    rawNeedlePaths = ''
) {
    proxyApplyFn('eval', function(context) {
        const before = context.reflect();
        if ( typeof before !== 'object' ) { return before; }
        if ( before === null ) { return null; }
        const after = objectPruneFn(before, rawPrunePaths, rawNeedlePaths);
        return after || before;
    });
}

function freezeElementProperty(
    property = '',
    selector = '',
    pattern = ''
) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('freeze-element-property', property, selector, pattern);
    const matcher = safe.initPattern(pattern, { canNegate: true });
    const owner = (( ) => {
        if ( Object.hasOwn(HTMLScriptElement.prototype, property) ) {
            return HTMLScriptElement.prototype;
        }
        if ( Object.hasOwn(HTMLElement.prototype, property) ) {
            return HTMLElement.prototype;
        }
        if ( Object.hasOwn(Element.prototype, property) ) {
            return Element.prototype;
        }
        if ( Object.hasOwn(Node.prototype, property) ) {
            return Node.prototype;
        }
        return null;
    })();
    if ( owner === null ) { return; }
    const current = safe.Object_getOwnPropertyDescriptor(owner, property);
    if ( current === undefined ) { return; }
    const shouldPreventSet = (elem, a) => {
        if ( selector !== '' ) {
            if ( typeof elem.matches !== 'function' ) { return false; }
            if ( elem.matches(selector) === false ) { return false; }
        }
        return safe.testPattern(matcher, `${a}`);
    };
    Object.defineProperty(owner, property, {
        get: function() {
            return current.get
                ? current.get.call(this)
                : current.value;
        },
        set: function(a) {
            if ( shouldPreventSet(this, a) ) {
                safe.uboLog(logPrefix, 'Assignment prevented');
            } else if ( current.set ) {
                current.set.call(this, a);
            }
            if ( safe.logLevel > 1 ) {
                safe.uboLog(logPrefix, `Assigned:\n${a}`);
            }
            current.value = a;
        },
    });
}

function generateContentFn(trusted, directive) {
    const safe = safeSelf();
    const randomize = len => {
        const chunks = [];
        let textSize = 0;
        do {
            const s = safe.Math_random().toString(36).slice(2);
            chunks.push(s);
            textSize += s.length;
        }
        while ( textSize < len );
        return chunks.join(' ').slice(0, len);
    };
    if ( directive === 'true' ) {
        return randomize(10);
    }
    if ( directive === 'emptyObj' ) {
        return '{}';
    }
    if ( directive === 'emptyArr' ) {
        return '[]';
    }
    if ( directive === 'emptyStr' ) {
        return '';
    }
    if ( directive.startsWith('length:') ) {
        const match = /^length:(\d+)(?:-(\d+))?$/.exec(directive);
        if ( match === null ) { return ''; }
        const min = parseInt(match[1], 10);
        const extent = safe.Math_max(parseInt(match[2], 10) || 0, min) - min;
        const len = safe.Math_min(min + extent * safe.Math_random(), 500000);
        return randomize(len | 0);
    }
    if ( directive.startsWith('war:') ) {
        // TODO: resources should be fetched by messaging ISOLATED world
        return '';
    }
    if ( directive.startsWith('join:') ) {
        const parts = directive.slice(7)
                .split(directive.slice(5, 7))
                .map(a => generateContentFn(trusted, a));
        return parts.some(a => a instanceof Promise)
            ? Promise.all(parts).then(parts => parts.join(''))
            : parts.join('');
    }
    if ( trusted ) {
        return directive;
    }
    return '';
}

function getExceptionTokenFn() {
    const token = getRandomTokenFn();
    const oe = self.onerror;
    self.onerror = function(msg, ...args) {
        if ( typeof msg === 'string' && msg.includes(token) ) { return true; }
        if ( oe instanceof Function ) {
            return oe.call(this, msg, ...args);
        }
    }.bind();
    return token;
}

function getRandomTokenFn() {
    const safe = safeSelf();
    return safe.String_fromCharCode(Date.now() % 26 + 97) +
        safe.Math_floor(safe.Math_random() * 982451653 + 982451653).toString(36);
}

function jsonEdit(jsonq = '', ...varargs) {
    jsonEditFn(false, jsonq, ...varargs);
}

function jsonEditFetchRequest(jsonq = '', ...args) {
    jsonEditFetchRequestFn(false, jsonq, ...args);
}

function jsonEditFetchRequestFn(trusted, jsonq = '', ...varargs) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix(
        `${trusted ? 'trusted-' : ''}json-edit-fetch-request`,
        jsonq
    );
    const jsonp = JSONPath.create(jsonq);
    if ( jsonp.valid === false || jsonp.value !== undefined && trusted !== true ) {
        return safe.uboLog(logPrefix, 'Bad JSONPath query');
    }
    const extraArgs = safe.parseVarargs(varargs);
    const propNeedles = parsePropertiesToMatchFn(extraArgs.propsToMatch, 'url');
    const filterBody = body => {
        if ( typeof body !== 'string' ) { return; }
        let data;
        try { data = safe.JSON_parse(body); }
        catch { }
        if ( data instanceof Object === false ) { return; }
        const objAfter = jsonp.apply(data);
        if ( objAfter === undefined ) { return; }
        return safe.JSON_stringify(objAfter);
    }
    const proxyHandler = context => {
        const args = context.callArgs;
        const [ resource, options ] = args;
        const bodyBefore = options?.body;
        if ( Boolean(bodyBefore) === false ) { return context.reflect(); }
        const bodyAfter = filterBody(bodyBefore);
        if ( bodyAfter === undefined || bodyAfter === bodyBefore ) {
            return context.reflect();
        }
        if ( propNeedles.size !== 0 ) {
            const props = collateFetchArgumentsFn(resource, options);
            const matched = matchObjectPropertiesFn(propNeedles, props);
            if ( matched === undefined ) { return context.reflect(); }
            if ( safe.logLevel > 1 ) {
                safe.uboLog(logPrefix, `Matched "propsToMatch":\n\t${matched.join('\n\t')}`);
            }
        }
        safe.uboLog(logPrefix, 'Edited');
        if ( safe.logLevel > 1 ) {
            safe.uboLog(logPrefix, `After edit:\n${bodyAfter}`);
        }
        options.body = bodyAfter;
        return context.reflect();
    };
    proxyApplyFn('fetch', proxyHandler);
    proxyApplyFn('Request', proxyHandler);
}

function jsonEditFetchResponse(jsonq = '', ...args) {
    jsonEditFetchResponseFn(false, jsonq, ...args);
}

function jsonEditFetchResponseFn(trusted, jsonq = '', ...varargs) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix(
        `${trusted ? 'trusted-' : ''}json-edit-fetch-response`,
        jsonq
    );
    const jsonp = JSONPath.create(jsonq);
    if ( jsonp.valid === false || jsonp.value !== undefined && trusted !== true ) {
        return safe.uboLog(logPrefix, 'Bad JSONPath query');
    }
    const extraArgs = safe.parseVarargs(varargs);
    const propNeedles = parsePropertiesToMatchFn(extraArgs.propsToMatch, 'url');
    proxyApplyFn('fetch', function(context) {
        const args = context.callArgs;
        const fetchPromise = context.reflect();
        if ( propNeedles.size !== 0 ) {
            const props = collateFetchArgumentsFn(...args);
            const matched = matchObjectPropertiesFn(propNeedles, props);
            if ( matched === undefined ) { return fetchPromise; }
            if ( safe.logLevel > 1 ) {
                safe.uboLog(logPrefix, `Matched "propsToMatch":\n\t${matched.join('\n\t')}`);
            }
        }
        return fetchPromise.then(responseBefore => {
            const response = responseBefore.clone();
            return response.json().then(obj => {
                if ( typeof obj !== 'object' ) { return responseBefore; }
                const objAfter = jsonp.apply(obj);
                if ( objAfter === undefined ) { return responseBefore; }
                safe.uboLog(logPrefix, 'Edited');
                const responseAfter = Response.json(objAfter, {
                    status: responseBefore.status,
                    statusText: responseBefore.statusText,
                    headers: responseBefore.headers,
                });
                Object.defineProperties(responseAfter, {
                    ok: { value: responseBefore.ok },
                    redirected: { value: responseBefore.redirected },
                    type: { value: responseBefore.type },
                    url: { value: responseBefore.url },
                });
                return responseAfter;
            }).catch(reason => {
                safe.uboErr(logPrefix, 'Error:', reason);
                return responseBefore;
            });
        }).catch(reason => {
            safe.uboErr(logPrefix, 'Error:', reason);
            return fetchPromise;
        });
    });
}

function jsonEditFn(trusted = false, jsonq = '', ...varargs) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix(
        `${trusted ? 'trusted-' : ''}json-edit`,
        jsonq,
        ...varargs
    );
    const jsonp = JSONPath.create(jsonq);
    if ( jsonp.valid === false || jsonp.value !== undefined && trusted !== true ) {
        return safe.uboLog(logPrefix, 'Bad JSONPath query');
    }
    const extraArgs = safe.parseVarargs(varargs);
    const pattern = extraArgs.matches && safe.initPattern(extraArgs.matches);
    proxyApplyFn('JSON.parse', function(context) {
        const json = context.callArgs[0];
        const obj = context.reflect();
        if ( pattern && safe.testPattern(pattern, json) === false ) { return obj; }
        const objAfter = jsonp.apply(obj);
        if ( objAfter === undefined ) { return obj; }
        safe.uboLog(logPrefix, 'Edited');
        if ( safe.logLevel > 1 ) {
            safe.uboLog(logPrefix, `After edit:\n${safe.JSON_stringify(objAfter, null, 2)}`);
        }
        return objAfter;
    });
}

function jsonEditXhrResponse(jsonq = '', ...args) {
    jsonEditXhrResponseFn(false, jsonq, ...args);
}

function jsonEditXhrResponseFn(trusted, jsonq = '', ...varargs) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix(
        `${trusted ? 'trusted-' : ''}json-edit-xhr-response`,
        jsonq
    );
    const xhrInstances = new WeakMap();
    const jsonp = JSONPath.create(jsonq);
    if ( jsonp.valid === false || jsonp.value !== undefined && trusted !== true ) {
        return safe.uboLog(logPrefix, 'Bad JSONPath query');
    }
    const extraArgs = safe.parseVarargs(varargs);
    const propNeedles = parsePropertiesToMatchFn(extraArgs.propsToMatch, 'url');
    self.XMLHttpRequest = class extends self.XMLHttpRequest {
        open(method, url, ...args) {
            const xhrDetails = { method, url };
            const matched = propNeedles.size === 0 ||
                matchObjectPropertiesFn(propNeedles, xhrDetails);
            if ( matched ) {
                if ( safe.logLevel > 1 && Array.isArray(matched) ) {
                    safe.uboLog(logPrefix, `Matched "propsToMatch":\n\t${matched.join('\n\t')}`);
                }
                xhrInstances.set(this, xhrDetails);
            }
            return super.open(method, url, ...args);
        }
        get response() {
            const innerResponse = super.response;
            const xhrDetails = xhrInstances.get(this);
            if ( xhrDetails === undefined ) { return innerResponse; }
            const responseLength = typeof innerResponse === 'string'
                ? innerResponse.length
                : undefined;
            if ( xhrDetails.lastResponseLength !== responseLength ) {
                xhrDetails.response = undefined;
                xhrDetails.lastResponseLength = responseLength;
            }
            if ( xhrDetails.response !== undefined ) {
                return xhrDetails.response;
            }
            let obj;
            if ( typeof innerResponse === 'object' ) {
                obj = innerResponse;
            } else if ( typeof innerResponse === 'string' ) {
                try { obj = safe.JSON_parse(innerResponse); } catch { }
            }
            if ( typeof obj !== 'object' || obj === null ) {
                return (xhrDetails.response = innerResponse);
            }
            const objAfter = jsonp.apply(obj);
            if ( objAfter === undefined ) {
                return (xhrDetails.response = innerResponse);
            }
            safe.uboLog(logPrefix, 'Edited');
            const outerResponse = typeof innerResponse === 'string'
                ? JSONPath.toJSON(objAfter, safe.JSON_stringify)
                : objAfter;
            return (xhrDetails.response = outerResponse);
        }
        get responseText() {
            const response = this.response;
            return typeof response !== 'string'
                ? super.responseText
                : response;
        }
    };
}

function jsonlEditFn(jsonp, text = '', jsonExtract) {
    const safe = safeSelf();
    const lineSeparator = /\r?\n/.exec(text)?.[0] || '\n';
    const linesBefore = text.split('\n');
    const linesAfter = [];
    for ( const lineBefore of linesBefore ) {
        const match = jsonExtract.exec(lineBefore);
        if ( match === null ) {
            linesAfter.push(lineBefore);
            continue;
        }
        const jsonBefore = match[1];
        let obj;
        try { obj = safe.JSON_parse(jsonBefore); } catch { }
        if ( typeof obj !== 'object' || obj === null ) {
            linesAfter.push(lineBefore);
            continue;
        }
        const objAfter = jsonp.apply(obj);
        if ( objAfter === undefined ) {
            linesAfter.push(lineBefore);
            continue;
        }
        const jsonAfter = safe.JSON_stringify(objAfter);
        const lineAfter = [
            lineBefore.slice(0, match.index),
            jsonAfter,
            lineBefore.slice(match.index + jsonBefore.length),
        ].join('');
        linesAfter.push(lineAfter);
    }
    return linesAfter.join(lineSeparator);
}

function jsonlEditXhrResponse(jsonq = '', ...args) {
    jsonlEditXhrResponseFn(false, jsonq, ...args);
}

function jsonlEditXhrResponseFn(trusted, jsonq = '', ...varargs) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix(
        `${trusted ? 'trusted-' : ''}jsonl-edit-xhr-response`,
        jsonq
    );
    const xhrInstances = new WeakMap();
    const jsonp = JSONPath.create(jsonq);
    if ( jsonp.valid === false || jsonp.value !== undefined && trusted !== true ) {
        return safe.uboLog(logPrefix, 'Bad JSONPath query');
    }
    const extraArgs = safe.parseVarargs(varargs);
    const propNeedles = parsePropertiesToMatchFn(extraArgs.propsToMatch, 'url');
    const jsonExtract = extraArgs.jsonExtract
        ? new RegExp(extraArgs.jsonExtract)
        : /^(.*)$/;
    self.XMLHttpRequest = class extends self.XMLHttpRequest {
        open(method, url, ...args) {
            const xhrDetails = { method, url };
            const matched = propNeedles.size === 0 ||
                matchObjectPropertiesFn(propNeedles, xhrDetails);
            if ( matched ) {
                if ( safe.logLevel > 1 && Array.isArray(matched) ) {
                    safe.uboLog(logPrefix, `Matched "propsToMatch":\n\t${matched.join('\n\t')}`);
                }
                xhrInstances.set(this, xhrDetails);
            }
            return super.open(method, url, ...args);
        }
        get response() {
            const innerResponse = super.response;
            const xhrDetails = xhrInstances.get(this);
            if ( xhrDetails === undefined ) {
                return innerResponse;
            }
            const responseLength = typeof innerResponse === 'string'
                ? innerResponse.length
                : undefined;
            if ( xhrDetails.lastResponseLength !== responseLength ) {
                xhrDetails.response = undefined;
                xhrDetails.lastResponseLength = responseLength;
            }
            if ( xhrDetails.response !== undefined ) {
                return xhrDetails.response;
            }
            if ( typeof innerResponse !== 'string' ) {
                return (xhrDetails.response = innerResponse);
            }
            const outerResponse = jsonlEditFn(jsonp, innerResponse, jsonExtract);
            if ( outerResponse !== innerResponse ) {
                safe.uboLog(logPrefix, 'Pruned');
            }
            return (xhrDetails.response = outerResponse);
        }
        get responseText() {
            const response = this.response;
            return typeof response !== 'string'
                ? super.responseText
                : response;
        }
    };
}

function jsonPrune(
    rawPrunePaths = '',
    rawNeedlePaths = '',
    stackNeedle = '',
    ...varargs
) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('json-prune', rawPrunePaths, rawNeedlePaths, stackNeedle);
    const stackNeedleDetails = safe.initPattern(stackNeedle, { canNegate: true });
    const extraArgs = safe.parseVarargs(varargs);
    proxyApplyFn('JSON.parse', function(context) {
        const objBefore = context.reflect();
        if ( rawPrunePaths === '' ) {
            safe.uboLog(logPrefix, safe.JSON_stringify(objBefore, null, 2));
        }
        const objAfter = objectPruneFn(
            objBefore,
            rawPrunePaths,
            rawNeedlePaths,
            stackNeedleDetails,
            extraArgs
        );
        if ( objAfter === undefined ) { return objBefore; }
        safe.uboLog(logPrefix, 'Pruned');
        if ( safe.logLevel > 1 ) {
            safe.uboLog(logPrefix, `After pruning:\n${safe.JSON_stringify(objAfter, null, 2)}`);
        }
        return objAfter;
    });
}

function jsonPruneFetchResponse(
    rawPrunePaths = '',
    rawNeedlePaths = '',
    ...varargs
) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('json-prune-fetch-response', rawPrunePaths, rawNeedlePaths);
    const extraArgs = safe.parseVarargs(varargs);
    const propNeedles = parsePropertiesToMatchFn(extraArgs.propsToMatch, 'url');
    const stackNeedle = safe.initPattern(extraArgs.stackToMatch || '', { canNegate: true });
    const logall = rawPrunePaths === '';
    const applyHandler = function(target, thisArg, args) {
        const fetchPromise = Reflect.apply(target, thisArg, args);
        if ( propNeedles.size !== 0 ) {
            const props = collateFetchArgumentsFn(...args);
            const matched = matchObjectPropertiesFn(propNeedles, props);
            if ( matched === undefined ) { return fetchPromise; }
            if ( safe.logLevel > 1 ) {
                safe.uboLog(logPrefix, `Matched "propsToMatch":\n\t${matched.join('\n\t')}`);
            }
        }
        return fetchPromise.then(responseBefore => {
            const response = responseBefore.clone();
            return response.json().then(objBefore => {
                if ( typeof objBefore !== 'object' ) { return responseBefore; }
                if ( logall ) {
                    safe.uboLog(logPrefix, safe.JSON_stringify(objBefore, null, 2));
                    return responseBefore;
                }
                const objAfter = objectPruneFn(
                    objBefore,
                    rawPrunePaths,
                    rawNeedlePaths,
                    stackNeedle,
                    extraArgs
                );
                if ( typeof objAfter !== 'object' ) { return responseBefore; }
                safe.uboLog(logPrefix, 'Pruned');
                const responseAfter = Response.json(objAfter, {
                    status: responseBefore.status,
                    statusText: responseBefore.statusText,
                    headers: responseBefore.headers,
                });
                Object.defineProperties(responseAfter, {
                    ok: { value: responseBefore.ok },
                    redirected: { value: responseBefore.redirected },
                    type: { value: responseBefore.type },
                    url: { value: responseBefore.url },
                });
                return responseAfter;
            }).catch(reason => {
                safe.uboErr(logPrefix, 'Error:', reason);
                return responseBefore;
            });
        }).catch(reason => {
            safe.uboErr(logPrefix, 'Error:', reason);
            return fetchPromise;
        });
    };
    self.fetch = new Proxy(self.fetch, {
        apply: applyHandler
    });
}

function jsonPruneXhrResponse(
    rawPrunePaths = '',
    rawNeedlePaths = '',
    ...varargs
) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('json-prune-xhr-response', rawPrunePaths, rawNeedlePaths);
    const xhrInstances = new WeakMap();
    const extraArgs = safe.parseVarargs(varargs);
    const propNeedles = parsePropertiesToMatchFn(extraArgs.propsToMatch, 'url');
    const stackNeedle = safe.initPattern(extraArgs.stackToMatch || '', { canNegate: true });
    self.XMLHttpRequest = class extends self.XMLHttpRequest {
        open(method, url, ...args) {
            const xhrDetails = { method, url };
            let outcome = 'match';
            if ( propNeedles.size !== 0 ) {
                if ( matchObjectPropertiesFn(propNeedles, xhrDetails) === undefined ) {
                    outcome = 'nomatch';
                }
            }
            if ( outcome === 'match' ) {
                if ( safe.logLevel > 1 ) {
                    safe.uboLog(logPrefix, `Matched optional "propsToMatch", "${extraArgs.propsToMatch}"`);
                }
                xhrInstances.set(this, xhrDetails);
            }
            return super.open(method, url, ...args);
        }
        get response() {
            const innerResponse = super.response;
            const xhrDetails = xhrInstances.get(this);
            if ( xhrDetails === undefined ) {
                return innerResponse;
            }
            const responseLength = typeof innerResponse === 'string'
                ? innerResponse.length
                : undefined;
            if ( xhrDetails.lastResponseLength !== responseLength ) {
                xhrDetails.response = undefined;
                xhrDetails.lastResponseLength = responseLength;
            }
            if ( xhrDetails.response !== undefined ) {
                return xhrDetails.response;
            }
            let objBefore;
            if ( typeof innerResponse === 'object' ) {
                objBefore = innerResponse;
            } else if ( typeof innerResponse === 'string' ) {
                try {
                    objBefore = safe.JSON_parse(innerResponse);
                } catch {
                }
            }
            if ( typeof objBefore !== 'object' ) {
                return (xhrDetails.response = innerResponse);
            }
            const objAfter = objectPruneFn(
                objBefore,
                rawPrunePaths,
                rawNeedlePaths,
                stackNeedle,
                extraArgs
            );
            let outerResponse;
            if ( typeof objAfter === 'object' ) {
                outerResponse = typeof innerResponse === 'string'
                    ? safe.JSON_stringify(objAfter)
                    : objAfter;
                safe.uboLog(logPrefix, 'Pruned');
            } else {
                outerResponse = innerResponse;
            }
            return (xhrDetails.response = outerResponse);
        }
        get responseText() {
            const response = this.response;
            return typeof response !== 'string'
                ? super.responseText
                : response;
        }
    };
}

function m3uPrune(
    m3uPattern = '',
    urlPattern = ''
) {
    if ( typeof m3uPattern !== 'string' ) { return; }
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('m3u-prune', m3uPattern, urlPattern);
    const toLog = [];
    const regexFromArg = arg => {
        if ( arg === '' ) { return /^/; }
        const match = /^\/(.+)\/([gms]*)$/.exec(arg);
        if ( match !== null ) {
            let flags = match[2] || '';
            if ( flags.includes('m') ) { flags += 's'; }
            return new RegExp(match[1], flags);
        }
        return new RegExp(
            arg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*+/g, '.*?')
        );
    };
    const reM3u = regexFromArg(m3uPattern);
    const reUrl = regexFromArg(urlPattern);
    const pruneSpliceoutBlock = (lines, i) => {
        if ( lines[i].startsWith('#EXT-X-CUE:TYPE="SpliceOut"') === false ) {
            return false;
        }
        toLog.push(`\t${lines[i]}`);
        lines[i] = undefined; i += 1;
        if ( lines[i].startsWith('#EXT-X-ASSET:CAID') ) {
            toLog.push(`\t${lines[i]}`);
            lines[i] = undefined; i += 1;
        }
        if ( lines[i].startsWith('#EXT-X-SCTE35:') ) {
            toLog.push(`\t${lines[i]}`);
            lines[i] = undefined; i += 1;
        }
        if ( lines[i].startsWith('#EXT-X-CUE-IN') ) {
            toLog.push(`\t${lines[i]}`);
            lines[i] = undefined; i += 1;
        }
        if ( lines[i].startsWith('#EXT-X-SCTE35:') ) {
            toLog.push(`\t${lines[i]}`);
            lines[i] = undefined; i += 1;
        }
        return true;
    };
    const pruneInfBlock = (lines, i) => {
        if ( lines[i].startsWith('#EXTINF') === false ) { return false; }
        if ( reM3u.test(lines[i+1]) === false ) { return false; }
        toLog.push('Discarding', `\t${lines[i]}, \t${lines[i+1]}`);
        lines[i] = lines[i+1] = undefined; i += 2;
        if ( lines[i].startsWith('#EXT-X-DISCONTINUITY') ) {
            toLog.push(`\t${lines[i]}`);
            lines[i] = undefined; i += 1;
        }
        return true;
    };
    const pruner = text => {
        if ( (/^\s*#EXTM3U/.test(text)) === false ) { return text; }
        if ( m3uPattern === '' ) {
            safe.uboLog(` Content:\n${text}`);
            return text;
        }
        if ( reM3u.multiline ) {
            reM3u.lastIndex = 0;
            for (;;) {
                const match = reM3u.exec(text);
                if ( match === null ) { break; }
                let discard = match[0];
                let before = text.slice(0, match.index);
                if (
                    /^[\n\r]+/.test(discard) === false &&
                    /[\n\r]+$/.test(before) === false
                ) {
                    const startOfLine = /[^\n\r]+$/.exec(before);
                    if ( startOfLine !== null ) {
                        before = before.slice(0, startOfLine.index);
                        discard = startOfLine[0] + discard;
                    }
                }
                let after = text.slice(match.index + match[0].length);
                if (
                    /[\n\r]+$/.test(discard) === false &&
                    /^[\n\r]+/.test(after) === false
                ) {
                    const endOfLine = /^[^\n\r]+/.exec(after);
                    if ( endOfLine !== null ) {
                        after = after.slice(endOfLine.index);
                        discard += discard + endOfLine[0];
                    }
                }
                text = before.trim() + '\n' + after.trim();
                reM3u.lastIndex = before.length + 1;
                toLog.push('Discarding', ...safe.String_split.call(discard, /\n+/).map(s => `\t${s}`));
                if ( reM3u.global === false ) { break; }
            }
            return text;
        }
        const lines = safe.String_split.call(text, /\n\r|\n|\r/);
        for ( let i = 0; i < lines.length; i++ ) {
            if ( lines[i] === undefined ) { continue; }
            if ( pruneSpliceoutBlock(lines, i) ) { continue; }
            if ( pruneInfBlock(lines, i) ) { continue; }
        }
        return lines.filter(l => l !== undefined).join('\n');
    };
    const urlFromArg = arg => {
        if ( typeof arg === 'string' ) { return arg; }
        if ( arg instanceof Request ) { return arg.url; }
        return String(arg);
    };
    proxyApplyFn('fetch', async function fetch(context) {
        const args = context.callArgs;
        const fetchPromise = context.reflect();
        if ( reUrl.test(urlFromArg(args[0])) === false ) { return fetchPromise; }
        const responseBefore = await fetchPromise;
        const responseClone = responseBefore.clone();
        const textBefore = await responseClone.text();
        const textAfter = pruner(textBefore);
        if ( textAfter === textBefore ) { return responseBefore; }
        const responseAfter = new Response(textAfter, {
            status: responseBefore.status,
            statusText: responseBefore.statusText,
            headers: responseBefore.headers,
        });
        Object.defineProperties(responseAfter, {
            url: { value: responseBefore.url },
            type: { value: responseBefore.type },
        });
        if ( toLog.length !== 0 ) {
            toLog.unshift(logPrefix);
            safe.uboLog(toLog.join('\n'));
        }
        return responseAfter;
    })
    self.XMLHttpRequest.prototype.open = new Proxy(self.XMLHttpRequest.prototype.open, {
        apply: async (target, thisArg, args) => {
            if ( reUrl.test(urlFromArg(args[1])) === false ) {
                return Reflect.apply(target, thisArg, args);
            }
            thisArg.addEventListener('readystatechange', function() {
                if ( thisArg.readyState !== 4 ) { return; }
                const type = thisArg.responseType;
                if ( type !== '' && type !== 'text' ) { return; }
                const textin = thisArg.responseText;
                const textout = pruner(textin);
                if ( textout === textin ) { return; }
                Object.defineProperty(thisArg, 'response', { value: textout });
                Object.defineProperty(thisArg, 'responseText', { value: textout });
                if ( toLog.length !== 0 ) {
                    toLog.unshift(logPrefix);
                    safe.uboLog(toLog.join('\n'));
                }
            });
            return Reflect.apply(target, thisArg, args);
        }
    });
}

function matchesStackTraceFn(
    needleDetails,
    logLevel = ''
) {
    const safe = safeSelf();
    const exceptionToken = getExceptionTokenFn();
    const error = new safe.Error(exceptionToken);
    const docURL = new URL(self.location.href);
    docURL.hash = '';
    // Normalize stack trace
    const reLine = /(.*?@)?(\S+)(:\d+):\d+\)?$/;
    const lines = [];
    for ( let line of safe.String_split.call(error.stack, /[\n\r]+/) ) {
        if ( line.includes(exceptionToken) ) { continue; }
        line = line.trim();
        const match = safe.RegExp_exec.call(reLine, line);
        if ( match === null ) { continue; }
        let url = match[2];
        if ( url.startsWith('(') ) { url = url.slice(1); }
        if ( url === docURL.href ) {
            url = 'inlineScript';
        } else if ( url.startsWith('<anonymous>') ) {
            url = 'injectedScript';
        }
        let fn = match[1] !== undefined
            ? match[1].slice(0, -1)
            : line.slice(0, match.index).trim();
        if ( fn.startsWith('at') ) { fn = fn.slice(2).trim(); }
        let rowcol = match[3];
        lines.push(' ' + `${fn} ${url}${rowcol}:1`.trim());
    }
    lines[0] = `stackDepth:${lines.length-1}`;
    const stack = lines.join('\t');
    const r = needleDetails.matchAll !== true &&
        safe.testPattern(needleDetails, stack);
    if (
        logLevel === 'all' ||
        logLevel === 'match' && r ||
        logLevel === 'nomatch' && !r
    ) {
        safe.uboLog(stack.replace(/\t/g, '\n'));
    }
    return r;
}

function matchObjectPropertiesFn(propNeedles, ...objs) {
    const safe = safeSelf();
    const matched = [];
    for ( const obj of objs ) {
        if ( obj instanceof Object === false ) { continue; }
        for ( const [ prop, details ] of propNeedles ) {
            let value = obj[prop];
            if ( value === undefined ) { continue; }
            if ( typeof value !== 'string' ) {
                try { value = safe.JSON_stringify(value); }
                catch { }
                if ( typeof value !== 'string' ) { continue; }
            }
            if ( safe.testPattern(details, value) === false ) { return; }
            matched.push(`${prop}: ${value}`);
        }
    }
    return matched;
}

function modifyXhrResponseFn(
    propsToMatch = '',
    modifierFn = ''
) {
    if ( typeof propsToMatch !== 'string' ) { return; }
    const safe = safeSelf();
    if ( modifyXhrResponseFn.xhrInstances === undefined ) {
        modifyXhrResponseFn.xhrInstances = new WeakMap();
    }
    const propNeedles = parsePropertiesToMatchFn(propsToMatch, 'url');
    const NativeXMLHttpRequest = self.XMLHttpRequest;
    const TrappedXMLHttpRequest = class XMLHttpRequest extends NativeXMLHttpRequest {
        open(method, url, ...args) {
            const haystack = { method, url };
            if ( propsToMatch === '' ) {
                safe.uboLog(`modifyXhrResponseFn() / Called: ${safe.JSON_stringify(haystack, null, 2)}`);
            } else if ( matchObjectPropertiesFn(propNeedles, haystack) ) {
                modifyXhrResponseFn.xhrInstances.set(this, modifierFn);
            }
            return super.open(method, url, ...args);
        }
        get response() {
            const modifierFn = modifyXhrResponseFn.xhrInstances.get(this);
            return modifierFn
                ? modifierFn(this, super.response)
                : super.response;
        }
        get responseText() {
            const modifierFn = modifyXhrResponseFn.xhrInstances.get(this);
            return modifierFn
                ? modifierFn(this, super.responseText)
                : super.responseText;
        }
        get responseXML() {
            const modifierFn = modifyXhrResponseFn.xhrInstances.get(this);
            return modifierFn
                ? modifierFn(this, super.responseXML)
                : super.responseXML;
        }
    };
    proxyToStringFn(TrappedXMLHttpRequest.prototype.open, NativeXMLHttpRequest.prototype.open);
    proxyToStringFn(TrappedXMLHttpRequest, NativeXMLHttpRequest);
    self.XMLHttpRequest = TrappedXMLHttpRequest;
}

function mpegdashPrune(
    selector = '',
    propsToMatch = ''
) {
    if ( typeof selector !== 'string' ) { return; }
    if ( selector === '' ) { return; }
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('mpegdash-prune', selector, propsToMatch);
    const queryAll = (xmlDoc, selector) => {
        if ( selector.startsWith('xpath:') === false ) {
            return Array.from(xmlDoc.querySelectorAll(selector));
        }
        const xpr = xmlDoc.evaluate(
            selector.slice(6),
            xmlDoc,
            null,
            XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
            null
        );
        const out = [];
        for ( let i = 0; i < xpr.snapshotLength; i++ ) {
            const node = xpr.snapshotItem(i);
            out.push(node);
        }
        return out;
    };
    const rePTparse = /^PT(\d+D)?(\d+H)?(\d+M)?([\d.]+S)?$/;
    const secondsPerDay = 24 * 60 * 60;
    const secondsPerHour = 60 * 60;
    const secondsPerMinute = 60;
    const secondsFromPT = pt => {
        const match = rePTparse.exec(pt);
        if ( match === null ) { return; }
        let seconds = 0;
        if ( match[1] ) {
            const d = parseFloat(match[1].slice(0, -1));
            if ( isNaN(d) ) { return; }
            seconds += d * secondsPerDay;
        }
        if ( match[2] ) {
            const h = parseFloat(match[2].slice(0, -1));
            if ( isNaN(h) ) { return; }
            seconds += h * secondsPerHour;
        }
        if ( match[3] ) {
            const m = parseFloat(match[3].slice(0, -1));
            if ( isNaN(m) ) { return; }
            seconds += m * secondsPerMinute;
        }
        if ( match[4] ) {
            const s = parseFloat(match[4].slice(0, -1));
            if ( isNaN(s) ) { return; }
            seconds += s;
        }
        return seconds;
    };
    const ptFromSeconds = seconds => {
        const parts = [ 'PT' ];
        const d = Math.floor(seconds / secondsPerDay);
        if ( d ) {
            parts.push(`${d}D`);
            seconds -= d * secondsPerDay;
        }
        const h = Math.floor(seconds / secondsPerHour);
        if ( h ) {
            parts.push(`${h}H`);
            seconds -= h * secondsPerHour;
        }
        const m = Math.floor(seconds / secondsPerMinute);
        if ( m ) {
            parts.push(`${m}M`);
            seconds -= m * secondsPerMinute;
        }
        parts.push(`${seconds}S`);
        return parts.join('');
    };
    const fixTimeAttributes = xmlDoc => {
        try {
            const periods = queryAll(xmlDoc, 'MPD > Period');
            if ( periods.length === 0 ) { return; }
            let seconds = 0;
            for ( const period of periods ) {
                const startAttrBefore = period.getAttribute('start');
                const durAttr = period.getAttribute('duration');
                if ( startAttrBefore === null || durAttr === null ) { continue; }
                const startAttrAfter = ptFromSeconds(seconds);
                period.setAttribute('start', startAttrAfter);
                if ( period.hasAttribute('id') ) {
                    const idAttr = period.getAttribute('id');
                    period.setAttribute('id', idAttr.replace(startAttrBefore, startAttrAfter));
                }
                seconds += secondsFromPT(durAttr);
            }
            const mpds = queryAll(xmlDoc, 'MPD[mediaPresentationDuration]');
            if ( mpds.length !== 1 ) { return; }
            mpds[0].setAttribute('mediaPresentationDuration', ptFromSeconds(seconds));
        } catch {
        }
    };
    const pruneFromDoc = xmlDoc => {
        try {
            if ( selector === '' ) {
                const serializer = new XMLSerializer();
                safe.uboLog(logPrefix, `Document is\n\t${serializer.serializeToString(xmlDoc)}`);
            }
            const items = queryAll(xmlDoc, selector);
            if ( items.length === 0 ) { return xmlDoc; }
            safe.uboLog(logPrefix, `Patching ${items.length} items`);
            for ( const item of items ) {
                if ( item.nodeType !== 1 ) { continue; }
                item.setAttribute('duration', 'PT0S');
            }
            fixTimeAttributes(xmlDoc);
        } catch(ex) {
            safe.uboErr(logPrefix, `Error: ${ex}`);
        }
        return xmlDoc;
    };
    const pruneFromText = text => {
        if ( (/^\s*</.test(text) && />\s*$/.test(text)) === false ) {
            return text;
        }
        try {
            const xmlParser = new DOMParser();
            const xmlDoc = xmlParser.parseFromString(text, 'text/xml');
            pruneFromDoc(xmlDoc);
            const serializer = new XMLSerializer();
            text = serializer.serializeToString(xmlDoc);
        } catch {
        }
        return text;
    };
    modifyXhrResponseFn(propsToMatch, (xhr, before) => {
        if ( before instanceof XMLDocument ) {
            return pruneFromDoc(before);
        }
        if ( typeof before === 'string' ) {
            return pruneFromText(before);
        }
        return before;
    });
}

function noEvalIf(
    needle = ''
) {
    if ( typeof needle !== 'string' ) { return; }
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('noeval-if', needle);
    const reNeedle = safe.patternToRegex(needle);
    proxyApplyFn('eval', function(context) {
        const { callArgs } = context;
        const a = String(callArgs[0]);
        if ( needle !== '' && reNeedle.test(a) ) {
            safe.uboLog(logPrefix, 'Prevented:\n', a);
            return;
        }
        if ( needle === '' || safe.logLevel > 1 ) {
            safe.uboLog(logPrefix, 'Not prevented:\n', a);
        }
        return context.reflect();
    });
}

function noWebrtc() {
    var rtcName = window.RTCPeerConnection ? 'RTCPeerConnection' : (
        window.webkitRTCPeerConnection ? 'webkitRTCPeerConnection' : ''
    );
    if ( rtcName === '' ) { return; }
    var log = console.log.bind(console);
    var pc = function(cfg) {
        log('Document tried to create an RTCPeerConnection: %o', cfg);
    };
    const noop = function() {
    };
    pc.prototype = {
        close: noop,
        createDataChannel: noop,
        createOffer: noop,
        setRemoteDescription: noop,
        toString: function() {
            return '[object RTCPeerConnection]';
        }
    };
    var z = window[rtcName];
    window[rtcName] = pc.bind(window);
    if ( z.prototype ) {
        z.prototype.createDataChannel = function() {
            return {
                close: function() {},
                send: function() {}
            };
        }.bind(null);
    }
}

function noWindowOpenIf(
    pattern = '',
    delay = '',
    decoy = ''
) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('no-window-open-if', pattern, delay, decoy);
    const targetMatchResult = pattern.startsWith('!') === false;
    if ( targetMatchResult === false ) {
        pattern = pattern.slice(1);
    }
    const rePattern = safe.patternToRegex(pattern);
    const autoRemoveAfter = (parseFloat(delay) || 0) * 1000;
    const setTimeout = self.setTimeout;
    const createDecoy = function(tag, urlProp, url) {
        const decoyElem = document.createElement(tag);
        decoyElem[urlProp] = url;
        decoyElem.style.setProperty('height','1px', 'important');
        decoyElem.style.setProperty('position','fixed', 'important');
        decoyElem.style.setProperty('top','-1px', 'important');
        decoyElem.style.setProperty('width','1px', 'important');
        document.body.appendChild(decoyElem);
        setTimeout(( ) => { decoyElem.remove(); }, autoRemoveAfter);
        return decoyElem;
    };
    const noopFunc = function(){};
    proxyApplyFn('open', function open(context) {
        if ( pattern === 'debug' && safe.logLevel !== 0 ) {
            debugger; // eslint-disable-line no-debugger
            return context.reflect();
        }
        const { callArgs } = context;
        const haystack = callArgs.join(' ');
        if ( rePattern.test(haystack) !== targetMatchResult ) {
            if ( safe.logLevel > 1 ) {
                safe.uboLog(logPrefix, `Allowed (${callArgs.join(', ')})`);
            }
            return context.reflect();
        }
        safe.uboLog(logPrefix, `Prevented (${callArgs.join(', ')})`);
        if ( delay === '' ) { return null; }
        if ( decoy === 'blank' ) {
            callArgs[0] = 'about:blank';
            const r = context.reflect();
            setTimeout(( ) => { r.close(); }, autoRemoveAfter);
            return r;
        }
        const decoyElem = decoy === 'obj'
            ? createDecoy('object', 'data', ...callArgs)
            : createDecoy('iframe', 'src', ...callArgs);
        let popup = decoyElem.contentWindow;
        if ( typeof popup === 'object' && popup !== null ) {
            Object.defineProperty(popup, 'closed', { value: false });
        } else {
            popup = new Proxy(self, {
                get: function(target, prop, ...args) {
                    if ( prop === 'closed' ) { return false; }
                    const r = Reflect.get(target, prop, ...args);
                    if ( typeof r === 'function' ) { return noopFunc; }
                    return r;
                },
                set: function(...args) {
                    return Reflect.set(...args);
                },
            });
        }
        if ( safe.logLevel !== 0 ) {
            popup = new Proxy(popup, {
                get: function(target, prop, ...args) {
                    const r = Reflect.get(target, prop, ...args);
                    safe.uboLog(logPrefix, `popup / get ${prop} === ${r}`);
                    if ( typeof r === 'function' ) {
                        return (...args) => { return r.call(target, ...args); };
                    }
                    return r;
                },
                set: function(target, prop, value, ...args) {
                    safe.uboLog(logPrefix, `popup / set ${prop} = ${value}`);
                    return Reflect.set(target, prop, value, ...args);
                },
            });
        }
        return popup;
    });
}

function objectFindOwnerFn(
    root,
    path,
    prune = false
) {
    const safe = safeSelf();
    let owner = root;
    let chain = path;
    for (;;) {
        if ( typeof owner !== 'object' || owner === null  ) { return false; }
        const pos = chain.indexOf('.');
        if ( pos === -1 ) {
            if ( prune === false ) {
                return safe.Object_hasOwn(owner, chain);
            }
            let modified = false;
            if ( chain === '*' ) {
                for ( const key in owner ) {
                    if ( safe.Object_hasOwn(owner, key) === false ) { continue; }
                    delete owner[key];
                    modified = true;
                }
            } else if ( safe.Object_hasOwn(owner, chain) ) {
                delete owner[chain];
                modified = true;
            }
            return modified;
        }
        const prop = chain.slice(0, pos);
        const next = chain.slice(pos + 1);
        let found = false;
        if ( prop === '[-]' && Array.isArray(owner) ) {
            let i = owner.length;
            while ( i-- ) {
                if ( objectFindOwnerFn(owner[i], next) === false ) { continue; }
                owner.splice(i, 1);
                found = true;
            }
            return found;
        }
        if ( prop === '{-}' && owner instanceof Object ) {
            for ( const key of Object.keys(owner) ) {
                if ( objectFindOwnerFn(owner[key], next) === false ) { continue; }
                delete owner[key];
                found = true;
            }
            return found;
        }
        if (
            prop === '[]' && Array.isArray(owner) ||
            prop === '{}' && owner instanceof Object ||
            prop === '*' && owner instanceof Object
        ) {
            for ( const key of Object.keys(owner) ) {
                if (objectFindOwnerFn(owner[key], next, prune) === false ) { continue; }
                found = true;
            }
            return found;
        }
        if ( safe.Object_hasOwn(owner, prop) === false ) { return false; }
        owner = owner[prop];
        chain = chain.slice(pos + 1);
    }
}

function objectPruneFn(
    obj,
    rawPrunePaths,
    rawNeedlePaths,
    stackNeedleDetails = { matchAll: true },
    extraArgs = {}
) {
    if ( typeof rawPrunePaths !== 'string' ) { return; }
    const safe = safeSelf();
    const prunePaths = rawPrunePaths !== ''
        ? safe.String_split.call(rawPrunePaths, / +/)
        : [];
    const needlePaths = prunePaths.length !== 0 && rawNeedlePaths !== ''
        ? safe.String_split.call(rawNeedlePaths, / +/)
        : [];
    if ( stackNeedleDetails.matchAll !== true ) {
        if ( matchesStackTraceFn(stackNeedleDetails, extraArgs.logstack) === false ) {
            return;
        }
    }
    if ( objectPruneFn.mustProcess === undefined ) {
        objectPruneFn.mustProcess = (root, needlePaths) => {
            for ( const needlePath of needlePaths ) {
                if ( objectFindOwnerFn(root, needlePath) === false ) {
                    return false;
                }
            }
            return true;
        };
    }
    if ( prunePaths.length === 0 ) { return; }
    let outcome = 'nomatch';
    if ( objectPruneFn.mustProcess(obj, needlePaths) ) {
        for ( const path of prunePaths ) {
            if ( objectFindOwnerFn(obj, path, true) ) {
                outcome = 'match';
            }
        }
    }
    if ( outcome === 'match' ) { return obj; }
}

function offIdleFn(id) {
    if ( self.requestIdleCallback ) {
        return self.cancelIdleCallback(id);
    }
    return self.cancelAnimationFrame(id);
}

function onIdleFn(fn, options) {
    if ( self.requestIdleCallback ) {
        return self.requestIdleCallback(fn, options);
    }
    return self.requestAnimationFrame(fn);
}

function parsePropertiesToMatchFn(propsToMatch, implicit = '') {
    const safe = safeSelf();
    const needles = new Map();
    if ( propsToMatch === undefined || propsToMatch === '' ) { return needles; }
    const options = { canNegate: true };
    for ( const needle of safe.String_split.call(propsToMatch, /\s+/) ) {
        let [ prop, pattern ] = safe.String_split.call(needle, ':');
        if ( prop === '' ) { continue; }
        if ( pattern !== undefined && /[^$\w -]/.test(prop) ) {
            prop = `${prop}:${pattern}`;
            pattern = undefined;
        }
        if ( pattern !== undefined ) {
            needles.set(prop, safe.initPattern(pattern, options));
        } else if ( implicit !== '' ) {
            needles.set(implicit, safe.initPattern(prop, options));
        }
    }
    return needles;
}

function preventAddEventListener(
    type = '',
    pattern = '',
    ...varargs
) {
    const safe = safeSelf();
    const extraArgs = safe.parseVarargs(varargs);
    const logPrefix = safe.makeLogPrefix('prevent-addEventListener', type, pattern);
    const reType = safe.patternToRegex(type, undefined, true);
    const rePattern = safe.patternToRegex(pattern);
    const targetSelector = extraArgs.elements || undefined;
    const elementMatches = elem => {
        if ( targetSelector === 'window' ) { return elem === window; }
        if ( targetSelector === 'document' ) { return elem === document; }
        if ( elem && elem.matches && elem.matches(targetSelector) ) { return true; }
        const elems = Array.from(document.querySelectorAll(targetSelector));
        return elems.includes(elem);
    };
    const elementDetails = elem => {
        if ( elem instanceof Window ) { return 'window'; }
        if ( elem instanceof Document ) { return 'document'; }
        if ( elem instanceof Element === false ) { return '?'; }
        const parts = [];
        // https://github.com/uBlockOrigin/uAssets/discussions/17907#discussioncomment-9871079
        const id = String(elem.id);
        if ( id !== '' ) { parts.push(`#${CSS.escape(id)}`); }
        for ( let i = 0; i < elem.classList.length; i++ ) {
            parts.push(`.${CSS.escape(elem.classList.item(i))}`);
        }
        for ( let i = 0; i < elem.attributes.length; i++ ) {
            const attr = elem.attributes.item(i);
            if ( attr.name === 'id' ) { continue; }
            if ( attr.name === 'class' ) { continue; }
            parts.push(`[${CSS.escape(attr.name)}="${attr.value}"]`);
        }
        return parts.join('');
    };
    const shouldPrevent = (thisArg, type, handler) => {
        const matchesType = safe.RegExp_test(reType, type);
        const matchesHandler = safe.RegExp_test(rePattern, handler);
        const matchesEither = matchesType || matchesHandler;
        const matchesBoth = matchesType && matchesHandler;
        if ( safe.logLevel > 1 && matchesEither ) {
            debugger; // eslint-disable-line no-debugger
        }
        if ( matchesBoth && targetSelector !== undefined ) {
            if ( elementMatches(thisArg) === false ) { return false; }
        }
        return matchesBoth;
    };
    const proxyFn = function(context) {
        const { callArgs, thisArg } = context;
        let t, h;
        try {
            t = String(callArgs[0]);
            if ( typeof callArgs[1] === 'function' ) {
                h = String(safe.Function_toString(callArgs[1]));
            } else if ( typeof callArgs[1] === 'object' && callArgs[1] !== null ) {
                if ( typeof callArgs[1].handleEvent === 'function' ) {
                    h = String(safe.Function_toString(callArgs[1].handleEvent));
                }
            } else {
                h = String(callArgs[1]);
            }
        } catch {
        }
        if ( type === '' && pattern === '' ) {
            safe.uboLog(logPrefix, `Called: ${t}\n${h}\n${elementDetails(thisArg)}`);
        } else if ( shouldPrevent(thisArg, t, h) ) {
            return safe.uboLog(logPrefix, `Prevented: ${t}\n${h}\n${elementDetails(thisArg)}`);
        }
        return context.reflect();
    };
    const protect = owner => {
        const { addEventListener } = owner;
        Object.defineProperty(owner, 'addEventListener', {
            set() { },
            get() { return addEventListener; }
        });
    };
    runAt(( ) => {
        proxyApplyFn('EventTarget.prototype.addEventListener', proxyFn);
        if ( extraArgs.protect ) { protect(EventTarget.prototype); }
        if ( Object.hasOwn(document, 'addEventListener') ) {
            proxyApplyFn('document.addEventListener', proxyFn);
            if ( extraArgs.protect ) { protect(document); }
        }
        if ( Object.hasOwn(window, 'addEventListener') ) {
            proxyApplyFn('window.addEventListener', proxyFn);
            if ( extraArgs.protect ) { protect(window); }
        }
    }, extraArgs.runAt);
}

function preventBab() {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('prevent-bab');
    const signatures = [
        [ 'blockadblock' ],
        [ 'babasbm' ],
        [ /getItem\('babn'\)/ ],
        [
            'getElementById',
            'String.fromCharCode',
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
            'charAt',
            'DOMContentLoaded',
            'AdBlock',
            'addEventListener',
            'doScroll',
            'fromCharCode',
            '<<2|r>>4',
            'sessionStorage',
            'clientWidth',
            'localStorage',
            'Math',
            'random',
        ],
    ];
    const check = function(s) {
        if ( typeof s !== 'string' ) { return false; }
        for ( const tokens of signatures ) {
            let match = 0;
            for ( const token of tokens ) {
                const hit = token instanceof RegExp
                    ? token.test(s)
                    : s.includes(token);
                if ( hit ) { match += 1; }
            }
            if ( (match / tokens.length) >= 0.8 ) { return true; }
        }
        return false;
    };
    proxyApplyFn('eval', function(context) {
        const a = context.callArgs[0];
        if ( !check(a) ) {
            return context.reflect();
        }
        safe.uboLog(logPrefix, 'Prevented');
        if ( document.body ) {
            document.body.style.removeProperty('visibility');
        }
        const el = document.getElementById('babasbmsgx');
        if ( el ) {
            el.parentNode.removeChild(el);
        }
    });
    proxyApplyFn('setTimeout', function(context) {
        const { callArgs } = context;
        const a = callArgs[0];
        if ( typeof a === 'string'  && /\.bab_elementid.$/.test(a) ) {
            callArgs[0] = ( ) => { };
            safe.uboLog(logPrefix, 'Prevented');
        }
        return context.reflect();
    });
}

function preventCanvas(
    contextType = ''
) {
    const safe = safeSelf();
    const pattern = safe.initPattern(contextType, { canNegate: true });
    const proto = globalThis.HTMLCanvasElement.prototype;
    proto.getContext = new Proxy(proto.getContext, {
        apply(target, thisArg, args) {
            if ( safe.testPattern(pattern, args[0]) ) { return null; }
            return Reflect.apply(target, thisArg, args);
        }
    });
}

function preventFetch(...args) {
    preventFetchFn(false, ...args);
}

function preventFetchFn(
    trusted = false,
    propsToMatch = '',
    responseBody = '',
    responseType = '',
    ...varargs
) {
    const safe = safeSelf();
    const setTimeout = self.setTimeout;
    const scriptletName = `${trusted ? 'trusted-' : ''}prevent-fetch`;
    const logPrefix = safe.makeLogPrefix(
        scriptletName,
        propsToMatch,
        responseBody,
        responseType
    );
    const extraArgs = safe.parseVarargs(varargs);
    const propNeedles = parsePropertiesToMatchFn(propsToMatch, 'url');
    const validResponseProps = {
        ok: [ false, true ],
        status: [ 403 ],
        statusText: [ '', 'Not Found' ],
        type: [ 'basic', 'cors', 'default', 'error', 'opaque' ],
    };
    const responseProps = {
        statusText: { value: 'OK' },
    };
    const responseHeaders = {};
    if ( /^\{.*\}$/.test(responseType) ) {
        try {
            Object.entries(JSON.parse(responseType)).forEach(([ p, v ]) => {
                if ( p === 'headers' && trusted ) {
                    Object.assign(responseHeaders, v);
                    return;
                }
                if ( validResponseProps[p] === undefined ) { return; }
                if ( validResponseProps[p].includes(v) === false ) { return; }
                responseProps[p] = { value: v };
            });
        }
        catch { }
    } else if ( responseType !== '' ) {
        if ( validResponseProps.type.includes(responseType) ) {
            responseProps.type = { value: responseType };
        }
    }
    proxyApplyFn('fetch', function fetch(context) {
        const { callArgs } = context;
        const details = collateFetchArgumentsFn(...callArgs);
        if ( safe.logLevel > 1 || propsToMatch === '' && responseBody === '' ) {
            const out = Array.from(Object.entries(details)).map(a => `${a[0]}:${a[1]}`);
            safe.uboLog(logPrefix, `Called: ${out.join('\n')}`);
        }
        if ( propsToMatch === '' && responseBody === '' ) {
            return context.reflect();
        }
        const matched = matchObjectPropertiesFn(propNeedles, details);
        if ( matched === undefined || matched.length === 0 ) {
            return context.reflect();
        }
        return Promise.resolve(generateContentFn(trusted, responseBody)).then(text => {
            safe.uboLog(logPrefix, `Prevented with response "${text}"`);
            const headers = Object.assign({}, responseHeaders);
            if ( headers['content-length'] === undefined ) {
                headers['content-length'] = text.length;
            }
            const response = new Response(text, { headers });
            const props = Object.assign(
                { url: { value: details.url } },
                responseProps
            );
            safe.Object_defineProperties(response, props);
            if ( extraArgs.throttle ) {
                return new Promise(resolve => {
                    setTimeout(( ) => { resolve(response); }, extraArgs.throttle);
                });
            }
            return response;
        });
    });
}

function preventInnerHTML(
    selector = '',
    pattern = ''
) {
    freezeElementProperty('innerHTML', selector, pattern);
}

function preventRequestAnimationFrame(
    needleRaw = ''
) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('prevent-requestAnimationFrame', needleRaw);
    const needleNot = needleRaw.charAt(0) === '!';
    const reNeedle = safe.patternToRegex(needleNot ? needleRaw.slice(1) : needleRaw);
    proxyApplyFn('requestAnimationFrame', function(context) {
        const { callArgs } = context;
        const a = callArgs[0] instanceof Function
            ? safe.String(safe.Function_toString(callArgs[0]))
            : safe.String(callArgs[0]);
        if ( needleRaw === '' ) {
            safe.uboLog(logPrefix, `Called:\n${a}`);
        } else if ( reNeedle.test(a) !== needleNot ) {
            callArgs[0] = function(){};
            safe.uboLog(logPrefix, `Prevented:\n${a}`);
        }
        return context.reflect();
    });
}

function preventSetInterval(
    needleRaw = '',
    delayRaw = ''
) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('prevent-setInterval', needleRaw, delayRaw);
    const needleNot = needleRaw.charAt(0) === '!';
    const reNeedle = safe.patternToRegex(needleNot ? needleRaw.slice(1) : needleRaw);
    const range = new RangeParser(delayRaw);
    proxyApplyFn('setInterval', function(context) {
        const { callArgs } = context;
        const a = callArgs[0] instanceof Function
            ? safe.String(safe.Function_toString(callArgs[0]))
            : safe.String(callArgs[0]);
        const b = callArgs[1];
        if ( needleRaw === '' && range.unbound() ) {
            safe.uboLog(logPrefix, `Called:\n${a}\n${b}`);
            return context.reflect();
        }
        if ( reNeedle.test(a) !== needleNot && range.test(b) ) {
            callArgs[0] = function(){};
            safe.uboLog(logPrefix, `Prevented:\n${a}\n${b}`);
        }
        return context.reflect();
    });
}

function preventSetTimeout(
    needleRaw = '',
    delayRaw = ''
) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('prevent-setTimeout', needleRaw, delayRaw);
    const needleNot = needleRaw.charAt(0) === '!';
    const reNeedle = safe.patternToRegex(needleNot ? needleRaw.slice(1) : needleRaw);
    const range = new RangeParser(delayRaw);
    proxyApplyFn('setTimeout', function(context) {
        const { callArgs } = context;
        const a = callArgs[0] instanceof Function
            ? safe.String(safe.Function_toString(callArgs[0]))
            : safe.String(callArgs[0]);
        const b = callArgs[1];
        if ( needleRaw === '' && range.unbound() ) {
            safe.uboLog(logPrefix, `Called:\n${a}\n${b}`);
            return context.reflect();
        }
        if ( reNeedle.test(a) !== needleNot && range.test(b) ) {
            callArgs[0] = function(){};
            safe.uboLog(logPrefix, `Prevented:\n${a}\n${b}`);
        }
        return context.reflect();
    });
}

function preventXhr(...args) {
    preventXhrFn(false, ...args);
}

function preventXhrFn(
    trusted = false,
    propsToMatch = '',
    directive = ''
) {
    if ( typeof propsToMatch !== 'string' ) { return; }
    const safe = safeSelf();
    const scriptletName = trusted ? 'trusted-prevent-xhr' : 'prevent-xhr';
    const logPrefix = safe.makeLogPrefix(scriptletName, propsToMatch, directive);
    const xhrInstances = new WeakMap();
    const propNeedles = parsePropertiesToMatchFn(propsToMatch, 'url');
    const warOrigin = scriptletGlobals.warOrigin;
    const safeDispatchEvent = (xhr, type) => {
        try {
            xhr.dispatchEvent(new Event(type));
        } catch {
        }
    };
    proxyApplyFn('XMLHttpRequest.prototype.open', function(context) {
        const { thisArg, callArgs } = context;
        xhrInstances.delete(thisArg);
        const [ method, url, ...args ] = callArgs;
        if ( warOrigin !== undefined && url.startsWith(warOrigin) ) {
            return context.reflect();
        }
        const haystack = { method, url };
        if ( propsToMatch === '' && directive === '' ) {
            safe.uboLog(logPrefix, `Called: ${safe.JSON_stringify(haystack, null, 2)}`);
            return context.reflect();
        }
        if ( matchObjectPropertiesFn(propNeedles, haystack) ) {
            const xhrDetails = Object.assign(haystack, {
                xhr: thisArg,
                defer: args.length === 0 || !!args[0],
                directive,
                headers: {
                    'date': '',
                    'content-type': '',
                    'content-length': '',
                },
                url: haystack.url,
                props: {
                    response: { value: '' },
                    responseText: { value: '' },
                    responseXML: { value: null },
                },
            });
            xhrInstances.set(thisArg, xhrDetails);
        }
        return context.reflect();
    });
    proxyApplyFn('XMLHttpRequest.prototype.send', function(context) {
        const { thisArg } = context;
        const xhrDetails = xhrInstances.get(thisArg);
        if ( xhrDetails === undefined ) {
            return context.reflect();
        }
        xhrDetails.headers['date'] = (new Date()).toUTCString();
        let xhrText = '';
        switch ( thisArg.responseType ) {
        case 'arraybuffer':
            xhrDetails.props.response.value = new ArrayBuffer(0);
            xhrDetails.headers['content-type'] = 'application/octet-stream';
            break;
        case 'blob':
            xhrDetails.props.response.value = new Blob([]);
            xhrDetails.headers['content-type'] = 'application/octet-stream';
            break;
        case 'document': {
            const parser = new DOMParser();
            const doc = parser.parseFromString('', 'text/html');
            xhrDetails.props.response.value = doc;
            xhrDetails.props.responseXML.value = doc;
            xhrDetails.headers['content-type'] = 'text/html';
            break;
        }
        case 'json':
            xhrDetails.props.response.value = {};
            xhrDetails.props.responseText.value = '{}';
            xhrDetails.headers['content-type'] = 'application/json';
            break;
        default: {
            if ( directive === '' ) { break; }
            xhrText = generateContentFn(trusted, xhrDetails.directive);
            if ( xhrText instanceof Promise ) {
                xhrText = xhrText.then(text => {
                    xhrDetails.props.response.value = text;
                    xhrDetails.props.responseText.value = text;
                });
            } else {
                xhrDetails.props.response.value = xhrText;
                xhrDetails.props.responseText.value = xhrText;
            }
            xhrDetails.headers['content-type'] = 'text/plain';
            break;
        }
        }
        if ( xhrDetails.defer === false ) {
            xhrDetails.headers['content-length'] = `${xhrDetails.props.response.value}`.length;
            Object.defineProperties(xhrDetails.xhr, {
                readyState: { value: 4 },
                responseURL: { value: xhrDetails.url },
                status: { value: 200 },
                statusText: { value: 'OK' },
            });
            Object.defineProperties(xhrDetails.xhr, xhrDetails.props);
            return;
        }
        Promise.resolve(xhrText).then(( ) => xhrDetails).then(details => {
            Object.defineProperties(details.xhr, {
                readyState: { value: 1, configurable: true },
                responseURL: { value: xhrDetails.url },
            });
            safeDispatchEvent(details.xhr, 'readystatechange');
            return details;
        }).then(details => {
            xhrDetails.headers['content-length'] = `${details.props.response.value}`.length;
            Object.defineProperties(details.xhr, {
                readyState: { value: 2, configurable: true },
                status: { value: 200 },
                statusText: { value: 'OK' },
            });
            safeDispatchEvent(details.xhr, 'readystatechange');
            return details;
        }).then(details => {
            Object.defineProperties(details.xhr, {
                readyState: { value: 3, configurable: true },
            });
            Object.defineProperties(details.xhr, details.props);
            safeDispatchEvent(details.xhr, 'readystatechange');
            return details;
        }).then(details => {
            Object.defineProperties(details.xhr, {
                readyState: { value: 4 },
            });
            safeDispatchEvent(details.xhr, 'readystatechange');
            safeDispatchEvent(details.xhr, 'load');
            safeDispatchEvent(details.xhr, 'loadend');
            safe.uboLog(logPrefix, `Prevented with response:\n${details.xhr.response}`);
        });
    });
    proxyApplyFn('XMLHttpRequest.prototype.getResponseHeader', function(context) {
        const { thisArg } = context;
        const xhrDetails = xhrInstances.get(thisArg);
        if ( xhrDetails === undefined || thisArg.readyState < thisArg.HEADERS_RECEIVED ) {
            return context.reflect();
        }
        const headerName = `${context.callArgs[0]}`;
        const value = xhrDetails.headers[headerName.toLowerCase()];
        if ( value !== undefined && value !== '' ) { return value; }
        return null;
    });
    proxyApplyFn('XMLHttpRequest.prototype.getAllResponseHeaders', function(context) {
        const { thisArg } = context;
        const xhrDetails = xhrInstances.get(thisArg);
        if ( xhrDetails === undefined || thisArg.readyState < thisArg.HEADERS_RECEIVED ) {
            return context.reflect();
        }
        const out = [];
        for ( const [ name, value ] of Object.entries(xhrDetails.headers) ) {
            if ( !value ) { continue; }
            out.push(`${name}: ${value}`);
        }
        if ( out.length !== 0 ) { out.push(''); }
        return out.join('\r\n');
    });
}

function proxyApplyConfig(config = '') {
    try {
        if ( typeof proxyApplyFn !== 'function' ) { return; }
        config = JSON.parse(config);
        if ( typeof config !== 'object' ) { return; }
        Object.assign(proxyApplyFn, config);
    } catch {
    }
}

function proxyApplyFn(
    target = '',
    handler = '',
    options = {}
) {
    let context = globalThis;
    let prop = target;
    for (;;) {
        const pos = prop.indexOf('.');
        if ( pos === -1 ) { break; }
        context = context[prop.slice(0, pos)];
        if ( context instanceof Object === false ) { return; }
        prop = prop.slice(pos+1);
    }
    const fn = context[prop];
    if ( typeof fn !== 'function' ) { return; }
    if ( proxyApplyFn.CtorContext === undefined ) {
        proxyApplyFn.ctorContexts = [];
        proxyApplyFn.CtorContext = class {
            constructor(...args) {
                this.init(...args);
            }
            init(callFn, callArgs) {
                this.callFn = callFn;
                this.callArgs = callArgs;
                return this;
            }
            reflect() {
                const r = Reflect.construct(this.callFn, this.callArgs);
                this.callFn = this.callArgs = this.private = undefined;
                proxyApplyFn.ctorContexts.push(this);
                return r;
            }
            static factory(...args) {
                return proxyApplyFn.ctorContexts.length !== 0
                    ? proxyApplyFn.ctorContexts.pop().init(...args)
                    : new proxyApplyFn.CtorContext(...args);
            }
        };
        proxyApplyFn.applyContexts = [];
        proxyApplyFn.ApplyContext = class {
            constructor(...args) {
                this.init(...args);
            }
            init(callFn, thisArg, callArgs) {
                this.callFn = callFn;
                this.thisArg = thisArg;
                this.callArgs = callArgs;
                return this;
            }
            reflect() {
                const r = Reflect.apply(this.callFn, this.thisArg, this.callArgs);
                this.callFn = this.thisArg = this.callArgs = this.private = undefined;
                proxyApplyFn.applyContexts.push(this);
                return r;
            }
            static factory(...args) {
                return proxyApplyFn.applyContexts.length !== 0
                    ? proxyApplyFn.applyContexts.pop().init(...args)
                    : new proxyApplyFn.ApplyContext(...args);
            }
        };
        proxyApplyFn.isCtor = new Map();
        proxyApplyFn.proxies = new WeakMap();
        if ( (options.skipToString || proxyApplyFn.skipToString) !== true ) {
            proxyApplyFn.nativeToString = Function.prototype.toString;
            const proxiedToString = new Proxy(Function.prototype.toString, {
                apply(target, thisArg) {
                    let proxied = thisArg;
                    for(;;) {
                        const fn = proxyApplyFn.proxies.get(proxied);
                        if ( fn === undefined ) { break; }
                        proxied = fn;
                    }
                    return proxyApplyFn.nativeToString.call(proxied);
                }
            });
            proxyApplyFn.proxies.set(proxiedToString, proxyApplyFn.nativeToString);
            Function.prototype.toString = proxiedToString;
        }
    }
    if ( proxyApplyFn.isCtor.has(target) === false ) {
        proxyApplyFn.isCtor.set(target, fn.prototype?.constructor === fn);
    }
    const proxyDetails = {
        apply(target, thisArg, args) {
            return handler(proxyApplyFn.ApplyContext.factory(target, thisArg, args));
        }
    };
    if ( proxyApplyFn.isCtor.get(target) ) {
        proxyDetails.construct = function(target, args) {
            return handler(proxyApplyFn.CtorContext.factory(target, args));
        };
    }
    const proxiedTarget = new Proxy(fn, proxyDetails);
    proxyApplyFn.proxies.set(proxiedTarget, fn);
    context[prop] = proxiedTarget;
}

function proxyToStringFn(proxiedFn, nativeFn) {
    if ( proxyToStringFn.proxies === undefined ) {
        proxyToStringFn.proxies = new WeakMap();
        proxyToStringFn.nativeToString = Function.prototype.toString;
        const proxiedToString = new Proxy(Function.prototype.toString, {
            apply(target, thisArg) {
                let proxied = thisArg;
                for(;;) {
                    const fn = proxyToStringFn.proxies.get(proxied);
                    if ( fn === undefined ) { break; }
                    proxied = fn;
                }
                return proxyToStringFn.nativeToString.call(proxied);
            }
        });
        proxyToStringFn.proxies.set(proxiedToString, proxyToStringFn.nativeToString);
        Function.prototype.toString = proxiedToString;
    }
    proxyToStringFn.proxies.set(proxiedFn, nativeFn);
}

function removeAttr(
    rawToken = '',
    rawSelector = '',
    behavior = '',
    ...varargs
) {
    if ( typeof rawToken !== 'string' ) { return; }
    if ( rawToken === '' ) { return; }
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('remove-attr',
        rawToken, rawSelector, behavior, ...varargs
    );
    const tokens = safe.String_split.call(rawToken, /\s*\|\s*/);
    const selector = tokens.map(a => {
        const b = CSS.escape(a);
        return rawSelector.includes(`[${b}]`) ? rawSelector : `${rawSelector}[${b}]`;
    }).join(',');
    const lazily = /\basap\b/.test(behavior) === false;
    const options = safe.parseVarargs(varargs);
    if ( safe.logLevel > 1 ) {
        safe.uboLog(logPrefix, `Target selector:\n\t${selector}`);
    }
    const rmattrFromNode = node => {
        for ( const attr of tokens ) {
            if ( node.hasAttribute(attr) === false ) { continue; }
            node.removeAttribute(attr);
            safe.uboLog(logPrefix, `Removed attribute '${attr}'`);
        }
    };
    const rmattr = nodes => {
        for ( const node of nodes ?? document.querySelectorAll(selector) ) {
            rmattrFromNode(node);
        }
    };
    const rmAttrLazily = ( ) => {
        if ( rmAttrLazily.timer !== undefined ) { return; }
        rmAttrLazily.timer = onIdleFn(( ) => {
            rmAttrLazily.timer = undefined;
            rmattr();
        }, { timeout: 17 });
    };
    const mutationHandler = mutations => {
        for ( const { addedNodes, removedNodes } of mutations ) {
            for ( const node of addedNodes ) {
                if ( node.nodeType !== 1 ) { continue; }
                if ( lazily ) { return rmAttrLazily(); }
                if ( node.matches(selector) ) {
                    rmattrFromNode(node);
                }
                if ( node.childElementCount ) {
                    rmattr(node.querySelectorAll(selector));
                }
            }
            if ( lazily ) { return; }
            for ( const node of removedNodes ) {
                if ( node.nodeType !== 1 ) { continue; }
                if ( node.matches(selector) ) {
                    rmattrFromNode(node);
                }
            }
        }
    };
    const stop = ( ) => {
        if ( start.observer ) {
            start.observer.disconnect();
            start.observer = undefined;
        }
        if ( rmAttrLazily.timer ) {
            offIdleFn(rmAttrLazily.timer);
            rmAttrLazily.timer = undefined;
        }
        if ( safe.logLevel > 1 ) {
            safe.uboLog(logPrefix, 'Quitting');
        }
    };
    const start = ( ) => {
        rmattr();
        if ( /\bstay\b/.test(behavior) === false ) {
            if ( options.quitAfter === undefined ) { return; }
        }
        start.observer = new MutationObserver(mutationHandler);
        start.observer.observe(document, {
            attributes: true,
            attributeFilter: tokens,
            childList: true,
            subtree: true,
        });
        if ( options.quitAfter ) {
            runAt(( ) => {
                self.setTimeout(stop, options.quitAfter * 1000);
            }, 'load');
        }
    };
    runAt(( ) => { start(); }, safe.String_split.call(behavior, /\s+/));
}

function runAt(fn, when) {
    const intFromReadyState = state => {
        const targets = {
            'loading': 1, 'asap': 1,
            'interactive': 2, 'end': 2, '2': 2,
            'complete': 3, 'idle': 3, '3': 3,
        };
        const tokens = Array.isArray(state) ? state : [ state ];
        for ( const token of tokens ) {
            const prop = `${token}`;
            if ( Object.hasOwn(targets, prop) === false ) { continue; }
            return targets[prop];
        }
        return 0;
    };
    const runAt = intFromReadyState(when);
    if ( intFromReadyState(document.readyState) >= runAt ) {
        fn(); return;
    }
    const onStateChange = ( ) => {
        if ( intFromReadyState(document.readyState) < runAt ) { return; }
        fn();
        safe.removeEventListener.apply(document, args);
    };
    const safe = safeSelf();
    const args = [ 'readystatechange', onStateChange, { capture: true } ];
    safe.addEventListener.apply(document, args);
}

function runAtHtmlElementFn(fn) {
    if ( document.documentElement ) {
        fn();
        return;
    }
    const observer = new MutationObserver(( ) => {
        observer.disconnect();
        fn();
    });
    observer.observe(document, { childList: true });
}

function safeSelf() {
    if ( safeSelf.safe ) {
        return safeSelf.safe;
    }
    const self = globalThis;
    const safe = {
        'Array_from': Array.from,
        'Error': self.Error,
        'Function_toString': Function.prototype.call.bind(self.Function.prototype.toString),
        'Math_floor': Math.floor,
        'Math_max': Math.max,
        'Math_min': Math.min,
        'Math_random': Math.random,
        'Object': Object,
        'Object_defineProperty': Object.defineProperty.bind(Object),
        'Object_defineProperties': Object.defineProperties.bind(Object),
        'Object_fromEntries': Object.fromEntries.bind(Object),
        'Object_getOwnPropertyDescriptor': Object.getOwnPropertyDescriptor.bind(Object),
        'Object_hasOwn': Object.hasOwn.bind(Object),
        'Object_toString': Object.prototype.toString,
        'RegExp': self.RegExp,
        'RegExp_test': Function.prototype.call.bind(self.RegExp.prototype.test),
        'RegExp_exec': self.RegExp.prototype.exec,
        'Request_clone': self.Request.prototype.clone,
        'String': self.String,
        'String_fromCharCode': String.fromCharCode,
        'String_split': String.prototype.split,
        'XMLHttpRequest': self.XMLHttpRequest,
        'XMLHttpRequest_open': Function.prototype.call.bind(self.XMLHttpRequest.prototype.open),
        'XMLHttpRequest_send': Function.prototype.call.bind(self.XMLHttpRequest.prototype.send),
        'addEventListener': self.EventTarget.prototype.addEventListener,
        'removeEventListener': self.EventTarget.prototype.removeEventListener,
        'fetch': self.fetch,
        'JSON': self.JSON,
        'JSON_parse': Function.prototype.call.bind(self.JSON.parse, self.JSON),
        'JSON_stringify': Function.prototype.call.bind(self.JSON.stringify, self.JSON),
        'structuredClone': Function.prototype.call.bind(self.structuredClone, self),
        'log': console.log.bind(console),
        // Properties
        logLevel: 0,
        // Methods
        makeLogPrefix(...args) {
            return this.sendToLogger && `[${args.join(' \u205D ')}]` || '';
        },
        uboLog(...args) {
            if ( this.sendToLogger === undefined ) { return; }
            if ( args === undefined || args[0] === '' ) { return; }
            return this.sendToLogger('info', ...args);
            
        },
        uboErr(...args) {
            if ( this.sendToLogger === undefined ) { return; }
            if ( args === undefined || args[0] === '' ) { return; }
            return this.sendToLogger('error', ...args);
        },
        escapeRegexChars(s) {
            return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        },
        initPattern(pattern, options = {}) {
            if ( pattern === '' ) {
                return { matchAll: true, expect: true };
            }
            const expect = (options.canNegate !== true || pattern.startsWith('!') === false);
            if ( expect === false ) {
                pattern = pattern.slice(1);
            }
            const match = /^\/(.+)\/([gimsu]*)$/.exec(pattern);
            if ( match !== null ) {
                return {
                    re: new this.RegExp(
                        match[1],
                        match[2] || options.flags
                    ),
                    expect,
                };
            }
            if ( options.flags !== undefined ) {
                return {
                    re: new this.RegExp(this.escapeRegexChars(pattern),
                        options.flags
                    ),
                    expect,
                };
            }
            return { pattern, expect };
        },
        testPattern(details, haystack) {
            if ( details.matchAll ) { return true; }
            if ( details.re ) {
                return this.RegExp_test(details.re, haystack) === details.expect;
            }
            return haystack.includes(details.pattern) === details.expect;
        },
        patternToRegex(pattern, flags = undefined, verbatim = false) {
            if ( pattern === '' ) { return /^/; }
            const match = /^\/(.+)\/([gimsu]*)$/.exec(pattern);
            if ( match === null ) {
                const reStr = this.escapeRegexChars(pattern);
                return new RegExp(verbatim ? `^${reStr}$` : reStr, flags);
            }
            try {
                return new RegExp(match[1], match[2] || undefined);
            }
            catch {
            }
            return /^/;
        },
        parseVarargs(varargs) {
            const entries = varargs.reduce((out, v, i, a) => {
                if ( i & 1 ) { return out; }
                const rawValue = a[i+1];
                const value = /^\d+$/.test(rawValue)
                    ? parseInt(rawValue, 10)
                    : rawValue;
                out.push([ a[i], value ]);
                return out;
            }, []);
            return this.Object_fromEntries(entries);
        },
    };
    safeSelf.safe = safe;
    if ( scriptletGlobals.bcSecret === undefined ) { return safe; }
    // This is executed only when the logger is opened
    safe.logLevel = scriptletGlobals.logLevel || 1;
    let lastLogType = '';
    let lastLogText = '';
    let lastLogTime = 0;
    safe.toLogText = (type, ...args) => {
        if ( args.length === 0 ) { return; }
        const text = `[${document.location.hostname || document.location.href}]${args.join(' ')}`;
        if ( text === lastLogText && type === lastLogType ) {
            if ( (Date.now() - lastLogTime) < 5000 ) { return; }
        }
        lastLogType = type;
        lastLogText = text;
        lastLogTime = Date.now();
        return text;
    };
    try {
        const bc = new self.BroadcastChannel(scriptletGlobals.bcSecret);
        let bcBuffer = [];
        safe.sendToLogger = (type, ...args) => {
            const text = safe.toLogText(type, ...args);
            if ( text === undefined ) { return; }
            if ( bcBuffer === undefined ) {
                return bc.postMessage({ what: 'messageToLogger', type, text });
            }
            bcBuffer.push({ type, text });
        };
        bc.onmessage = ev => {
            const msg = ev.data;
            switch ( msg ) {
            case 'iamready!':
                if ( bcBuffer === undefined ) { break; }
                bcBuffer.forEach(({ type, text }) =>
                    bc.postMessage({ what: 'messageToLogger', type, text })
                );
                bcBuffer = undefined;
                break;
            case 'setScriptletLogLevelToOne':
                safe.logLevel = 1;
                break;
            case 'setScriptletLogLevelToTwo':
                safe.logLevel = 2;
                break;
            }
        };
        bc.postMessage('areyouready?');
    } catch {
        safe.sendToLogger = (type, ...args) => {
            const text = safe.toLogText(type, ...args);
            if ( text === undefined ) { return; }
            safe.log(`uBO ${text}`);
        };
    }
    return safe;
}

function setConstant(
    ...args
) {
    setConstantFn(false, ...args);
}

function setConstantFn(
    trusted = false,
    chain = '',
    rawValue = '',
    ...varargs
) {
    if ( chain === '' ) { return; }
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('set-constant', chain, rawValue);
    const extraArgs = safe.parseVarargs(varargs);
    function setConstant(chain, rawValue) {
        const trappedProp = (( ) => {
            const pos = chain.lastIndexOf('.');
            if ( pos === -1 ) { return chain; }
            return chain.slice(pos+1);
        })();
        const cloakFunc = fn => {
            safe.Object_defineProperty(fn, 'name', { value: trappedProp });
            return new Proxy(fn, {
                defineProperty(target, prop) {
                    if ( prop !== 'toString' ) {
                        return Reflect.defineProperty(...arguments);
                    }
                    return true;
                },
                deleteProperty(target, prop) {
                    if ( prop !== 'toString' ) {
                        return Reflect.deleteProperty(...arguments);
                    }
                    return true;
                },
                get(target, prop) {
                    if ( prop === 'toString' ) {
                        return function() {
                            return `function ${trappedProp}() { [native code] }`;
                        }.bind(null);
                    }
                    return Reflect.get(...arguments);
                },
            });
        };
        if ( trappedProp === '' ) { return; }
        const thisScript = document.currentScript;
        let normalValue = validateConstantFn(trusted, rawValue, extraArgs);
        if ( rawValue === 'noopFunc' || rawValue === 'trueFunc' || rawValue === 'falseFunc' ) {
            normalValue = cloakFunc(normalValue);
        }
        let aborted = false;
        const mustAbort = function(v) {
            if ( trusted ) { return false; }
            if ( aborted ) { return true; }
            aborted =
                (v !== undefined && v !== null) &&
                (normalValue !== undefined && normalValue !== null) &&
                (typeof v !== typeof normalValue);
            if ( aborted ) {
                safe.uboLog(logPrefix, `Aborted because value set to ${v}`);
            }
            return aborted;
        };
        // https://github.com/uBlockOrigin/uBlock-issues/issues/156
        //   Support multiple trappers for the same property.
        const trapProp = function(owner, prop, configurable, handler) {
            if ( handler.init(configurable ? owner[prop] : normalValue) === false ) { return; }
            const odesc = safe.Object_getOwnPropertyDescriptor(owner, prop);
            let prevGetter, prevSetter;
            if ( odesc instanceof safe.Object ) {
                owner[prop] = normalValue;
                if ( odesc.get instanceof Function ) {
                    prevGetter = odesc.get;
                }
                if ( odesc.set instanceof Function ) {
                    prevSetter = odesc.set;
                }
            }
            try {
                safe.Object_defineProperty(owner, prop, {
                    configurable,
                    get() {
                        if ( prevGetter !== undefined ) {
                            prevGetter();
                        }
                        return handler.getter();
                    },
                    set(a) {
                        if ( prevSetter !== undefined ) {
                            prevSetter(a);
                        }
                        handler.setter(a);
                    }
                });
                safe.uboLog(logPrefix, 'Trap installed');
            } catch(ex) {
                safe.uboErr(logPrefix, ex);
            }
        };
        const trapChain = function(owner, chain) {
            const pos = chain.indexOf('.');
            if ( pos === -1 ) {
                trapProp(owner, chain, false, {
                    v: undefined,
                    init: function(v) {
                        if ( mustAbort(v) ) { return false; }
                        this.v = v;
                        return true;
                    },
                    getter: function() {
                        if ( document.currentScript === thisScript ) {
                            return this.v;
                        }
                        safe.uboLog(logPrefix, 'Property read');
                        return normalValue;
                    },
                    setter: function(a) {
                        if ( mustAbort(a) === false ) { return; }
                        normalValue = a;
                    }
                });
                return;
            }
            const prop = chain.slice(0, pos);
            const v = owner[prop];
            chain = chain.slice(pos + 1);
            if ( v instanceof safe.Object || typeof v === 'object' && v !== null ) {
                trapChain(v, chain);
                return;
            }
            trapProp(owner, prop, true, {
                v: undefined,
                init: function(v) {
                    this.v = v;
                    return true;
                },
                getter: function() {
                    return this.v;
                },
                setter: function(a) {
                    this.v = a;
                    if ( a instanceof safe.Object ) {
                        trapChain(a, chain);
                    }
                }
            });
        };
        trapChain(window, chain);
    }
    runAt(( ) => {
        setConstant(chain, rawValue);
    }, extraArgs.runAt);
}

function spoofCSS(
    selector,
    ...args
) {
    if ( typeof selector !== 'string' ) { return; }
    if ( selector === '' ) { return; }
    const toCamelCase = s => s.replace(/-[a-z]/g, s => s.charAt(1).toUpperCase());
    const propToValueMap = new Map();
    const privatePropToValueMap = new Map();
    for ( let i = 0; i < args.length; i += 2 ) {
        const prop = toCamelCase(args[i+0]);
        if ( prop === '' ) { break; }
        const value = args[i+1];
        if ( typeof value !== 'string' ) { break; }
        if ( prop.charCodeAt(0) === 0x5F /* _ */ ) {
            privatePropToValueMap.set(prop, value);
        } else {
            propToValueMap.set(prop, value);
        }
    }
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('spoof-css', selector, ...args);
    const instanceProperties = [ 'cssText', 'length', 'parentRule' ];
    const spoofStyle = (prop, real) => {
        const normalProp = toCamelCase(prop);
        const shouldSpoof = propToValueMap.has(normalProp);
        const value = shouldSpoof ? propToValueMap.get(normalProp) : real;
        if ( shouldSpoof ) {
            safe.uboLog(logPrefix, `Spoofing ${prop} to ${value}`);
        }
        return value;
    };
    const cloackFunc = (fn, thisArg, name) => {
        const trap = fn.bind(thisArg);
        Object.defineProperty(trap, 'name', { value: name });
        Object.defineProperty(trap, 'toString', {
            value: ( ) => `function ${name}() { [native code] }`
        });
        return trap;
    };
    self.getComputedStyle = new Proxy(self.getComputedStyle, {
        apply: function(target, thisArg, args) {
            // eslint-disable-next-line no-debugger
            if ( privatePropToValueMap.has('_debug') ) { debugger; }
            const style = Reflect.apply(target, thisArg, args);
            const targetElements = new WeakSet(document.querySelectorAll(selector));
            if ( targetElements.has(args[0]) === false ) { return style; }
            const proxiedStyle = new Proxy(style, {
                get(target, prop) {
                    if ( typeof target[prop] === 'function' ) {
                        if ( prop === 'getPropertyValue' ) {
                            return cloackFunc(function getPropertyValue(prop) {
                                return spoofStyle(prop, target[prop]);
                            }, target, 'getPropertyValue');
                        }
                        return cloackFunc(target[prop], target, prop);
                    }
                    if ( instanceProperties.includes(prop) ) {
                        return Reflect.get(target, prop);
                    }
                    return spoofStyle(prop, Reflect.get(target, prop));
                },
                getOwnPropertyDescriptor(target, prop) {
                    if ( propToValueMap.has(prop) ) {
                        return {
                            configurable: true,
                            enumerable: true,
                            value: propToValueMap.get(prop),
                            writable: true,
                        };
                    }
                    return Reflect.getOwnPropertyDescriptor(target, prop);
                },
            });
            return proxiedStyle;
        },
        get(target, prop) {
            if ( prop === 'toString' ) {
                return target.toString.bind(target);
            }
            return Reflect.get(target, prop);
        },
    });
    Element.prototype.getBoundingClientRect = new Proxy(Element.prototype.getBoundingClientRect, {
        apply: function(target, thisArg, args) {
            // eslint-disable-next-line no-debugger
            if ( privatePropToValueMap.has('_debug') ) { debugger; }
            const rect = Reflect.apply(target, thisArg, args);
            const targetElements = new WeakSet(document.querySelectorAll(selector));
            if ( targetElements.has(thisArg) === false ) { return rect; }
            let { x, y, height, width } = rect;
            if ( privatePropToValueMap.has('_rectx') ) {
                x = parseFloat(privatePropToValueMap.get('_rectx'));
            }
            if ( privatePropToValueMap.has('_recty') ) {
                y = parseFloat(privatePropToValueMap.get('_recty'));
            }
            if ( privatePropToValueMap.has('_rectw') ) {
                width = parseFloat(privatePropToValueMap.get('_rectw'));
            } else if ( propToValueMap.has('width') ) {
                width = parseFloat(propToValueMap.get('width'));
            }
            if ( privatePropToValueMap.has('_recth') ) {
                height = parseFloat(privatePropToValueMap.get('_recth'));
            } else if ( propToValueMap.has('height') ) {
                height = parseFloat(propToValueMap.get('height'));
            }
            return new self.DOMRect(x, y, width, height);
        },
        get(target, prop) {
            if ( prop === 'toString' ) {
                return target.toString.bind(target);
            }
            return Reflect.get(target, prop);
        },
    });
}

function trapPropertyFn(propChain, handler, options = {}) {
    if ( propChain === '' ) { return; }
    let owner = self;
    let prop = propChain;
    for (;;) {
        const pos = prop.indexOf('.');
        if ( pos === -1 ) { break; }
        owner = owner[prop.slice(0, pos)];
        if ( owner instanceof Object === false ) { return; }
        prop = prop.slice(pos + 1);
    }
    const safe = safeSelf();
    if ( trapPropertyFn.db === undefined ) {
        trapPropertyFn.db = new WeakMap();
        trapPropertyFn.entryFromContext = (owner, prop) => {
            const handlers = trapPropertyFn.db.get(owner);
            return handlers?.get(prop);
        };
        trapPropertyFn.getter = (owner, prop) => {
            const entry = trapPropertyFn.entryFromContext(owner, prop);
            if ( entry === undefined ) { return; }
            let r = entry.value;
            for ( const desc of entry.stack ) {
                try { r = desc.get(); } catch (e) {
                    if ( entry.canThrow ) { throw e; }
                }
            }
            return r;
        };
        trapPropertyFn.setter = (owner, prop, value) => {
            const entry = trapPropertyFn.entryFromContext(owner, prop);
            if ( entry === undefined ) { return; }
            entry.value = value;
            for ( const desc of entry.stack ) {
                try { desc.set(value); } catch (e) {
                    if ( entry.canThrow ) { throw e; }
                }
            }
        };
    }
    const { db } = trapPropertyFn;
    const handlers = db.get(owner) || new Map();
    if ( handlers.size === 0 ) {
        db.set(owner, handlers);
    }
    const entry = handlers.get(prop) || {
        value: owner[prop],
        stack: [],
    };
    entry.stack.push(handler);
    if ( entry.stack.length > 1 ) { return entry.value; }
    Object.assign(entry, options);
    handlers.set(prop, entry);
    const desc = safe.Object_getOwnPropertyDescriptor(owner, prop);
    if ( desc instanceof safe.Object ) {
        if ( desc.get || desc.set ) {
            entry.stack.push(desc);
        }
    }
    try {
        safe.Object_defineProperty(owner, prop, {
            get() {
                return trapPropertyFn.getter(owner, prop);
            },
            set(value) {
                trapPropertyFn.setter(owner, prop, value);
            }
        });
    } catch {
    }
    return entry.value;
}

function trustedPreventXhr(...args) {
    preventXhrFn(true, ...args);
}

function validateConstantFn(trusted, raw, extraArgs = {}) {
    const safe = safeSelf();
    let value;
    if ( raw === 'undefined' ) {
        value = undefined;
    } else if ( raw === 'false' ) {
        value = false;
    } else if ( raw === 'true' ) {
        value = true;
    } else if ( raw === 'null' ) {
        value = null;
    } else if ( raw === "''" || raw === '' ) {
        value = '';
    } else if ( raw === '[]' || raw === 'emptyArr' ) {
        value = [];
    } else if ( raw === '{}' || raw === 'emptyObj' ) {
        value = {};
    } else if ( raw === 'noopFunc' ) {
        value = function(){};
    } else if ( raw === 'trueFunc' ) {
        value = function(){ return true; };
    } else if ( raw === 'falseFunc' ) {
        value = function(){ return false; };
    } else if ( raw === 'throwFunc' ) {
        value = function(){ throw ''; };
    } else if ( /^-?\d+$/.test(raw) ) {
        value = parseInt(raw);
        if ( isNaN(raw) ) { return; }
        if ( Math.abs(raw) > 0x7FFF ) { return; }
    } else if ( trusted ) {
        if ( raw.startsWith('json:') ) {
            try { value = safe.JSON_parse(raw.slice(5)); } catch { return; }
        } else if ( raw.startsWith('{') && raw.endsWith('}') ) {
            try { value = safe.JSON_parse(raw).value; } catch { return; }
        }
    } else {
        return;
    }
    if ( extraArgs.as !== undefined ) {
        if ( extraArgs.as === 'function' ) {
            return ( ) => value;
        } else if ( extraArgs.as === 'callback' ) {
            return ( ) => (( ) => value);
        } else if ( extraArgs.as === 'resolved' ) {
            return Promise.resolve(value);
        } else if ( extraArgs.as === 'rejected' ) {
            return Promise.reject(value);
        }
    }
    return value;
}

function xmlPrune(
    selector = '',
    selectorCheck = '',
    urlPattern = '',
    ...varargs
) {
    if ( typeof selector !== 'string' ) { return; }
    if ( selector === '' ) { return; }
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('xml-prune', selector, selectorCheck, urlPattern);
    const reUrl = safe.patternToRegex(urlPattern);
    const extraArgs = safe.parseVarargs(varargs);
    const queryAll = (xmlDoc, selector) => {
        const isXpath = /^xpath\(.+\)$/.test(selector);
        if ( isXpath === false ) {
            return Array.from(xmlDoc.querySelectorAll(selector));
        }
        const xpr = xmlDoc.evaluate(
            selector.slice(6, -1),
            xmlDoc,
            null,
            XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
            null
        );
        const out = [];
        for ( let i = 0; i < xpr.snapshotLength; i++ ) {
            const node = xpr.snapshotItem(i);
            out.push(node);
        }
        return out;
    };
    const pruneFromDoc = xmlDoc => {
        try {
            if ( selectorCheck !== '' && xmlDoc.querySelector(selectorCheck) === null ) {
                return xmlDoc;
            }
            if ( extraArgs.logdoc ) {
                const serializer = new XMLSerializer();
                safe.uboLog(logPrefix, `Document is\n\t${serializer.serializeToString(xmlDoc)}`);
            }
            const items = queryAll(xmlDoc, selector);
            if ( items.length === 0 ) { return xmlDoc; }
            safe.uboLog(logPrefix, `Removing ${items.length} items`);
            for ( const item of items ) {
                if ( item.nodeType === 1 ) {
                    item.remove();
                } else if ( item.nodeType === 2 ) {
                    item.ownerElement.removeAttribute(item.nodeName);
                }
                safe.uboLog(logPrefix, `${item.constructor.name}.${item.nodeName} removed`);
            }
        } catch(ex) {
            safe.uboErr(logPrefix, `Error: ${ex}`);
        }
        return xmlDoc;
    };
    const pruneFromText = text => {
        if ( (/^\s*</.test(text) && />\s*$/.test(text)) === false ) {
            return text;
        }
        try {
            const xmlParser = new DOMParser();
            const xmlDoc = xmlParser.parseFromString(text, 'text/xml');
            pruneFromDoc(xmlDoc);
            const serializer = new XMLSerializer();
            text = serializer.serializeToString(xmlDoc);
        } catch {
        }
        return text;
    };
    const urlFromArg = arg => {
        if ( typeof arg === 'string' ) { return arg; }
        if ( arg instanceof Request ) { return arg.url; }
        return String(arg);
    };
    self.fetch = new Proxy(self.fetch, {
        apply: function(target, thisArg, args) {
            const fetchPromise = Reflect.apply(target, thisArg, args);
            if ( reUrl.test(urlFromArg(args[0])) === false ) {
                return fetchPromise;
            }
            return fetchPromise.then(responseBefore => {
                const response = responseBefore.clone();
                return response.text().then(text => {
                    const responseAfter = new Response(pruneFromText(text), {
                        status: responseBefore.status,
                        statusText: responseBefore.statusText,
                        headers: responseBefore.headers,
                    });
                    Object.defineProperties(responseAfter, {
                        ok: { value: responseBefore.ok },
                        redirected: { value: responseBefore.redirected },
                        type: { value: responseBefore.type },
                        url: { value: responseBefore.url },
                    });
                    return responseAfter;
                }).catch(( ) =>
                    responseBefore
                );
            });
        }
    });
    modifyXhrResponseFn(urlPattern, (xhr, before) => {
        if ( before instanceof XMLDocument ) {
            return pruneFromDoc(before);
        }
        if ( typeof before === 'string' ) {
            return pruneFromText(before);
        }
        return before;
    });
}

function zeta_bf007897e9444e97b45ba51b9d31db7d() { // fingerprint2.js
// Reference:
// https://github.com/fingerprintjs/fingerprintjs/tree/v2

(function() {
    'use strict';
    const hex32 = len => {
        return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
            .toString(16)
            .slice(-len)
            .padStart(len, '0');
    };
    const browserId = `${hex32(8)}${hex32(8)}${hex32(8)}${hex32(8)}`;
    const fp2 = function(){};
    fp2.get = function(opts, cb) {
        if ( !cb  ) { cb = opts; }
        setTimeout(( ) => { cb([]); }, 1);
    };
    fp2.getPromise = function() {
        return Promise.resolve([]);
    };
    fp2.getV18 = function() {
        return browserId;
    };
    fp2.x64hash128 = function() {
        return browserId;
    };
    fp2.prototype = {
        get: function(opts, cb) {
            if ( !cb  ) { cb = opts; }
            setTimeout(( ) => { cb(browserId, []); }, 1);
        },
    };
    self.Fingerprint2 = self.Fingerprint = fp2;
})();
}

function zeta_455e9433c95d42119053d8fe06b0ff25() { // google-ima.js
'use strict';





if (!window.google || !window.google.ima || !window.google.ima.VERSION) {
  const VERSION = "3.764.0";
  const ima = {};

  class AdDisplayContainer {
    constructor(containerElement) {
      const divElement = document.createElement("div");
      divElement.style.setProperty("display", "none", "important");
      divElement.style.setProperty("visibility", "collapse", "important");
      containerElement.appendChild(divElement);
    }
    destroy() {}
    initialize() {}
  }

  class ImaSdkSettings {
    constructor() {
      this.c = true;
      this.f = {};
      this.i = false;
      this.l = "";
      this.p = "";
      this.r = 0;
      this.t = "";
      this.v = "";
    }
    getCompanionBackfill() {}
    getDisableCustomPlaybackForIOS10Plus() {
      return this.i;
    }
    getFeatureFlags() {
      return this.f;
    }
    getLocale() {
      return this.l;
    }
    getNumRedirects() {
      return this.r;
    }
    getPlayerType() {
      return this.t;
    }
    getPlayerVersion() {
      return this.v;
    }
    getPpid() {
      return this.p;
    }
    isCookiesEnabled() {
      return this.c;
    }
    setAutoPlayAdBreaks() {}
    setCompanionBackfill() {}
    setCookiesEnabled(c) {
      this.c = !!c;
    }
    setDisableCustomPlaybackForIOS10Plus(i) {
      this.i = !!i;
    }
    setFeatureFlags(f) {
      this.f = f;
    }
    setLocale(l) {
      this.l = l;
    }
    setNumRedirects(r) {
      this.r = r;
    }
    setPlayerType(t) {
      this.t = t;
    }
    setPlayerVersion(v) {
      this.v = v;
    }
    setPpid(p) {
      this.p = p;
    }
    setSessionId() {}
    setVpaidAllowed() {}
    setVpaidMode() {}

    // https://github.com/uBlockOrigin/uBlock-issues/issues/2265#issuecomment-1637094149
    getDisableFlashAds() {
    }
    setDisableFlashAds() {
    }
  }
  ImaSdkSettings.CompanionBackfillMode = {
    ALWAYS: "always",
    ON_MASTER_AD: "on_master_ad",
  };
  ImaSdkSettings.VpaidMode = {
    DISABLED: 0,
    ENABLED: 1,
    INSECURE: 2,
  };

  class EventHandler {
    constructor() {
      this.listeners = new Map();
    }

    _dispatch(e) {
      let listeners = this.listeners.get(e.type);
      listeners = listeners ? Array.from(listeners.values()) : [];
      for (const listener of listeners) {
        try {
          listener(e);
        } catch (r) {
          console.error(r);
        }
      }
    }

    addEventListener(types, c, options, context) {
      if (!Array.isArray(types)) {
        types = [types];
      }

      for (const t of types) {
        if (!this.listeners.has(t)) {
          this.listeners.set(t, new Map());
        }
        this.listeners.get(t).set(c, c.bind(context || this));
      }
    }

    removeEventListener(types, c) {
      if (!Array.isArray(types)) {
        types = [types];
      }

      for (const t of types) {
        const typeSet = this.listeners.get(t);
        if (typeSet) {
          typeSet.delete(c);
        }
      }
    }
  }

  class AdsLoader extends EventHandler {
    constructor() {
      super();
      this.settings = new ImaSdkSettings();
    }
    contentComplete() {}
    destroy() {}
    getSettings() {
      return this.settings;
    }
    getVersion() {
      return VERSION;
    }
    requestAds(_r, _c) {
      requestAnimationFrame(() => {
        const { ADS_MANAGER_LOADED } = AdsManagerLoadedEvent.Type;
        const event = new ima.AdsManagerLoadedEvent(ADS_MANAGER_LOADED, _r, _c);
        this._dispatch(event);
      });
      const error = new ima.AdError(
        "adPlayError",
        1205, 1205,
        "The browser prevented playback initiated without user interaction.",
        _r, _c
      );
      requestAnimationFrame( () => {
        this._dispatch(new ima.AdErrorEvent(error));
      });
    }
  }

  class AdsManager extends EventHandler {
    constructor() {
      super();
      this.volume = 1;
      this._enablePreloading = false;
    }
    collapse() {}
    configureAdsManager() {}
    destroy() {}
    discardAdBreak() {}
    expand() {}
    focus() {}
    getAdSkippableState() {
      return false;
    }
    getCuePoints() {
      return [0];
    }
    getCurrentAd() {
      return currentAd;
    }
    getCurrentAdCuePoints() {
      return [];
    }
    getRemainingTime() {
      return 0;
    }
    getVolume() {
      return this.volume;
    }
    init() {
      if (this._enablePreloading) {
        this._dispatch(new ima.AdEvent(AdEvent.Type.LOADED));
      }
    }
    isCustomClickTrackingUsed() {
      return false;
    }
    isCustomPlaybackUsed() {
      return false;
    }
    pause() {}
    requestNextAdBreak() {}
    resize() {}
    resume() {}
    setVolume(v) {
      this.volume = v;
    }
    skip() {}
    start() {
      requestAnimationFrame(() => {
        for (const type of [
          AdEvent.Type.LOADED,
          AdEvent.Type.STARTED,
          AdEvent.Type.CONTENT_PAUSE_REQUESTED,
          AdEvent.Type.AD_BUFFERING,
          AdEvent.Type.FIRST_QUARTILE,
          AdEvent.Type.MIDPOINT,
          AdEvent.Type.THIRD_QUARTILE,
          AdEvent.Type.COMPLETE,
          AdEvent.Type.ALL_ADS_COMPLETED,
          AdEvent.Type.CONTENT_RESUME_REQUESTED,
        ]) {
          try {
            this._dispatch(new ima.AdEvent(type));
          } catch (e) {
            console.error(e);
          }
        }
      });
    }
    stop() {}
    updateAdsRenderingSettings() {}
  }

  class AdsRenderingSettings {}

  class AdsRequest {
    setAdWillAutoPlay() {}
    setAdWillPlayMuted() {}
    setContinuousPlayback() {}
  }

  class AdPodInfo {
    getAdPosition() {
      return 1;
    }
    getIsBumper() {
      return false;
    }
    getMaxDuration() {
      return -1;
    }
    getPodIndex() {
      return 1;
    }
    getTimeOffset() {
      return 0;
    }
    getTotalAds() {
      return 1;
    }
  }

  class Ad {
    constructor() {
      this._pi = new AdPodInfo();
    }
    getAdId() {
      return "";
    }
    getAdPodInfo() {
      return this._pi;
    }
    getAdSystem() {
      return "";
    }
    getAdvertiserName() {
      return "";
    }
    getApiFramework() {
      return null;
    }
    getCompanionAds() {
      return [];
    }
    getContentType() {
      return "";
    }
    getCreativeAdId() {
      return "";
    }
    getCreativeId() {
      return "";
    }
    getDealId() {
      return "";
    }
    getDescription() {
      return "";
    }
    getDuration() {
      return 8.5;
    }
    getHeight() {
      return 0;
    }
    getMediaUrl() {
      return null;
    }
    getMinSuggestedDuration() {
      return -2;
    }
    getSkipTimeOffset() {
      return -1;
    }
    getSurveyUrl() {
      return null;
    }
    getTitle() {
      return "";
    }
    getTraffickingParameters() {
      return {};
    }
    getTraffickingParametersString() {
      return "";
    }
    getUiElements() {
      return [""];
    }
    getUniversalAdIdRegistry() {
      return "unknown";
    }
    getUniversalAdIds() {
      return [new UniversalAdIdInfo()];
    }
    getUniversalAdIdValue() {
      return "unknown";
    }
    getVastMediaBitrate() {
      return 0;
    }
    getVastMediaHeight() {
      return 0;
    }
    getVastMediaWidth() {
      return 0;
    }
    getWidth() {
      return 0;
    }
    getWrapperAdIds() {
      return [""];
    }
    getWrapperAdSystems() {
      return [""];
    }
    getWrapperCreativeIds() {
      return [""];
    }
    isLinear() {
      return true;
    }
    isSkippable() {
      return true;
    }
  }

  class CompanionAd {
    getAdSlotId() {
      return "";
    }
    getContent() {
      return "";
    }
    getContentType() {
      return "";
    }
    getHeight() {
      return 1;
    }
    getWidth() {
      return 1;
    }
  }

  class AdError {
    constructor(type, code, vast, message, request, context) {
      this.errorCode = code;
      this.message = message;
      this.type = type;
      this.adsRequest = request;
      this.userRequestContext = context;
      this.vastErrorCode = vast;
    }
    getErrorCode() {
      return this.errorCode;
    }
    getInnerError() {
        return null;
    }
    getMessage() {
      return this.message;
    }
    getType() {
      return this.type;
    }
    getVastErrorCode() {
      return this.vastErrorCode;
    }
    toString() {
      return `AdError ${this.errorCode}: ${this.message}`;
    }
  }
  AdError.ErrorCode = {};
  AdError.Type = {};

  const isEngadget = () => {
    try {
      for (const ctx of Object.values(window.vidible._getContexts())) {
        const player = ctx.getPlayer();
        if (!player) { continue;}
        const div = player.div;
        if (!div) { continue; }
        if (div.innerHTML.includes("www.engadget.com")) {
          return true;
        }
      }
    } catch {
    }
    return false;
  };

  const currentAd = isEngadget() ? undefined : new Ad();

  class AdEvent {
    constructor(type) {
      this.type = type;
    }
    getAd() {
      return currentAd;
    }
    getAdData() {
      return {};
    }
  }
  AdEvent.Type = {
    AD_BREAK_READY: "adBreakReady",
    AD_BUFFERING: "adBuffering",
    AD_CAN_PLAY: "adCanPlay",
    AD_METADATA: "adMetadata",
    AD_PROGRESS: "adProgress",
    ALL_ADS_COMPLETED: "allAdsCompleted",
    CLICK: "click",
    COMPLETE: "complete",
    CONTENT_PAUSE_REQUESTED: "contentPauseRequested",
    CONTENT_RESUME_REQUESTED: "contentResumeRequested",
    DURATION_CHANGE: "durationChange",
    EXPANDED_CHANGED: "expandedChanged",
    FIRST_QUARTILE: "firstQuartile",
    IMPRESSION: "impression",
    INTERACTION: "interaction",
    LINEAR_CHANGE: "linearChange",
    LINEAR_CHANGED: "linearChanged",
    LOADED: "loaded",
    LOG: "log",
    MIDPOINT: "midpoint",
    PAUSED: "pause",
    RESUMED: "resume",
    SKIPPABLE_STATE_CHANGED: "skippableStateChanged",
    SKIPPED: "skip",
    STARTED: "start",
    THIRD_QUARTILE: "thirdQuartile",
    USER_CLOSE: "userClose",
    VIDEO_CLICKED: "videoClicked",
    VIDEO_ICON_CLICKED: "videoIconClicked",
    VIEWABLE_IMPRESSION: "viewable_impression",
    VOLUME_CHANGED: "volumeChange",
    VOLUME_MUTED: "mute",
  };

  class AdErrorEvent {
    constructor(error) {
      this.type = "adError";
      this.error = error;
    }
    getError() {
      return this.error;
    }
    getUserRequestContext() {
      return this.error?.userRequestContext || {};
    }
  }
  AdErrorEvent.Type = {
    AD_ERROR: "adError",
  };

  const manager = new AdsManager();

  class AdsManagerLoadedEvent {
    constructor(type, request, context) {
      this.type = type;
      this.adsRequest = request;
      this.userRequestContext = context;
    }
    getAdsManager(c, settings) {
      if (settings && settings.enablePreloading) {
        manager._enablePreloading = true;
      }
      return manager;
    }
    getUserRequestContext() {
      return this.userRequestContext || {};
    }
  }
  AdsManagerLoadedEvent.Type = {
    ADS_MANAGER_LOADED: "adsManagerLoaded",
  };

  class CustomContentLoadedEvent {}
  CustomContentLoadedEvent.Type = {
    CUSTOM_CONTENT_LOADED: "deprecated-event",
  };

  class CompanionAdSelectionSettings {}
  CompanionAdSelectionSettings.CreativeType = {
    ALL: "All",
    FLASH: "Flash",
    IMAGE: "Image",
  };
  CompanionAdSelectionSettings.ResourceType = {
    ALL: "All",
    HTML: "Html",
    IFRAME: "IFrame",
    STATIC: "Static",
  };
  CompanionAdSelectionSettings.SizeCriteria = {
    IGNORE: "IgnoreSize",
    SELECT_EXACT_MATCH: "SelectExactMatch",
    SELECT_NEAR_MATCH: "SelectNearMatch",
  };

  class AdCuePoints {
    getCuePoints() {
      return [];
    }
  }

  class AdProgressData {}

  class UniversalAdIdInfo {
    getAdIdRegistry() {
      return "";
    }
    getAdIdValue() {
      return "";
    }
  }

  Object.assign(ima, {
    AdCuePoints,
    AdDisplayContainer,
    AdError,
    AdErrorEvent,
    AdEvent,
    AdPodInfo,
    AdProgressData,
    AdsLoader,
    AdsManager: manager,
    AdsManagerLoadedEvent,
    AdsRenderingSettings,
    AdsRequest,
    CompanionAd,
    CompanionAdSelectionSettings,
    CustomContentLoadedEvent,
    gptProxyInstance: {},
    ImaSdkSettings,
    OmidAccessMode: {
      DOMAIN: "domain",
      FULL: "full",
      LIMITED: "limited",
    },
    OmidVerificationVendor: {
      1: "OTHER",
      2: "GOOGLE",
      GOOGLE: 2,
      OTHER: 1
    },
    settings: new ImaSdkSettings(),
    UiElements: {
      AD_ATTRIBUTION: "adAttribution",
      COUNTDOWN: "countdown",
    },
    UniversalAdIdInfo,
    VERSION,
    ViewMode: {
      FULLSCREEN: "fullscreen",
      NORMAL: "normal",
    },
  });

  if (!window.google) {
    window.google = {};
  }

  window.google.ima = ima;
}
}

function zeta_5a5b2e808d404b088ffafe5aa4490953() { // noeval.js
(function() {
    'use strict';
    const log = console.log.bind(console);
    window.eval = new Proxy(window.eval, {          // jshint ignore: line
        apply: function(target, thisArg, args) {
            log(`Document tried to eval... ${args[0]}\n`);
        }
    });
})();
}

function zeta_aa9252a7ac6d4eafac6c5d569a29fd31() { // nofab.js
(function() {
    'use strict';
    const noopfn = function() {
    };
    const Fab = function() {};
    Fab.prototype.check = noopfn;
    Fab.prototype.clearEvent = noopfn;
    Fab.prototype.emitEvent = noopfn;
    Fab.prototype.on = function(a, b) {
        if ( !a ) { b(); }
        return this;
    };
    Fab.prototype.onDetected = function() {
        return this;
    };
    Fab.prototype.onNotDetected = function(a) {
        a();
        return this;
    };
    Fab.prototype.setOption = noopfn;
    Fab.prototype.options = {
        set: noopfn,
        get: noopfn,
    };
    const fab = new Fab();
    const getSetFab = {
        get: function() { return Fab; },
        set: function() {}
    };
    const getsetfab = {
        get: function() { return fab; },
        set: function() {}
    };
    if ( window.hasOwnProperty('FuckAdBlock') ) { window.FuckAdBlock = Fab; }
    else { Object.defineProperty(window, 'FuckAdBlock', getSetFab); }
    if ( window.hasOwnProperty('BlockAdBlock') ) { window.BlockAdBlock = Fab; }
    else { Object.defineProperty(window, 'BlockAdBlock', getSetFab); }
    if ( window.hasOwnProperty('SniffAdBlock') ) { window.SniffAdBlock = Fab; }
    else { Object.defineProperty(window, 'SniffAdBlock', getSetFab); }
    if ( window.hasOwnProperty('fuckAdBlock') ) { window.fuckAdBlock = fab; }
    else { Object.defineProperty(window, 'fuckAdBlock', getsetfab); }
    if ( window.hasOwnProperty('blockAdBlock') ) { window.blockAdBlock = fab; }
    else { Object.defineProperty(window, 'blockAdBlock', getsetfab); }
    if ( window.hasOwnProperty('sniffAdBlock') ) { window.sniffAdBlock = fab; }
    else { Object.defineProperty(window, 'sniffAdBlock', getsetfab); }
})();
}

function zeta_abd5e5c807194ecaa68419d89caab3b4() { // popads-dummy.js
(function() {
    'use strict';
    delete window.PopAds;
    delete window.popns;
    Object.defineProperties(window, {
        PopAds: { value: {} },
        popns: { value: {} }
    });
})();
}

/******************************************************************************/

scriptletGlobals.origins = (( ) => {
    const docloc = document.location;
    const origins = [ docloc.origin ];
    if ( docloc.ancestorOrigins?.length ) {
        const topOrigin = docloc.ancestorOrigins[docloc.ancestorOrigins.length-1];
        if ( topOrigin !== 'null' ) {
            origins.push(topOrigin);
        } else if ( scriptletGlobals.topOrigin ) {
            origins.push(scriptletGlobals.topOrigin);
        }
    }
    const out = [];
    for ( let i = 0; i < origins.length; i++ ) {
        const origin = origins[i];
        const beg = origin.indexOf('://') + 3;
        if ( beg === 2 ) { continue; }
        const end = origin.indexOf(':', beg);
        const hn = origin.slice(beg, end > 0 ? end : undefined);
        if ( hn.length === 0 ) { continue; }
        const hns = [ hn ];
        for ( let pos = 0; ; ) {
            pos = hn.indexOf('.', pos) + 1;
            if ( pos === 0 ) { break; }
            hns.push(hn.slice(pos));
        }
        hns.push('*');
        const ens = [];
        for ( let hn of hns ) {
            for (;;) {
                const pos = hn.lastIndexOf('.');
                if ( pos === -1 ) { break; }
                hn = hn.slice(0, pos);
                ens.push(`${hn}.*`);
            }
        }
        ens.sort((a, b) => {
            const d = b.length - a.length;
            if ( d !== 0 ) { return d; }
            return a > b ? -1 : 1;
        });
        out.push({ hns, ens, i });
    }
    return out;
})();

scriptletGlobals.functionRefs = /* 43 */ [setConstant,jsonPrune,jsonPruneFetchResponse,jsonEditFetchResponse,preventAddEventListener,preventSetInterval,preventFetch,zeta_5a5b2e808d404b088ffafe5aa4490953,abortOnPropertyRead,jsonPruneXhrResponse,jsonEdit,jsonlEditXhrResponse,preventSetTimeout,abortCurrentScript,adjustSetTimeout,abortOnPropertyWrite,noWebrtc,preventXhr,noWindowOpenIf,abortOnStackTrace,zeta_aa9252a7ac6d4eafac6c5d569a29fd31,removeAttr,adjustSetInterval,zeta_abd5e5c807194ecaa68419d89caab3b4,preventRequestAnimationFrame,noEvalIf,preventBab,disableNewtabLinks,preventInnerHTML,editObjectOnSetter,jsonEditXhrResponse,xmlPrune,m3uPrune,trustedPreventXhr,spoofCSS,zeta_455e9433c95d42119053d8fe06b0ff25,alertBuster,preventCanvas,mpegdashPrune,jsonEditFetchRequest,proxyApplyConfig,zeta_bf007897e9444e97b45ba51b9d31db7d,evaldataPrune];

/******************************************************************************/

// End of local scope
})("formant_ubo_static_fallback");

void 0;

/*******************************************************************************

    uBlock Origin Lite - a comprehensive, MV3-compliant content blocker
    Copyright (C) 2014-present Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock

*/

// ruleset: formant

// Important!
// Isolate from global scope

// Start of local scope
(function uBOL_scriptlets($SECRET_ID$) {

/******************************************************************************/

const scriptletGlobals = self[$SECRET_ID$];

if ( scriptletGlobals.origins.length === 0 ) { return; }

/******************************************************************************/

const $hasHostnames$ = true;
const $hasEntities$ = true;
const $hasAncestors$ = true;
const $hasRegexes$ = true;

/******************************************************************************/

const todo = new Set();

if ( $hasHostnames$ ) {
    const scriptletHostnames = /* 13944 */ ["g.pl","j.gs","s.to","3sk.*","al.ly","asd.*","bc.vc","br.de","bs.to","clk.*","di.fm","fc.lc","fr.de","fzm.*","g3g.*","gmx.*","hqq.*","kat.*","lz.de","m4u.*","mt.de","nn.de","nw.de","o2.pl","ok.ru","op.gg","ouo.*","oxy.*","pnd.*","qmh.*","rp5.*","sh.st","sn.at","tpb.*","tu.no","tz.de","ur.ly","vev.*","vz.lt","wa.de","wn.de","wp.de","wp.pl","wr.de","x.com","ytc.*","yts.*","za.gl","ze.tt","00m.in","1hd.to","2ddl.*","33sk.*","4br.me","4hu.tv","4j.com","538.nl","8se.me","9tsu.*","a8ix.*","agf.nl","aii.sh","al.com","as.com","av01.*","bbf.lt","bcvc.*","bde4.*","btdb.*","btv.bg","c2g.at","cap3.*","cbc.ca","crn.pl","cum.st","ddys.*","djs.sk","dlhd.*","dna.fr","dnn.de","dodz.*","dood.*","ebb.io","eio.io","epe.es","ettv.*","exe.io","eztv.*","fbgo.*","fnp.de","ft.com","geo.de","geo.fr","goo.st","gra.pl","haz.de","hd21.*","hdss.*","hna.de","iir.ai","iiv.pl","imx.to","ioe.vn","iyf.tv","jav.re","jav.sb","jav.si","javx.*","kaa.lt","kaa.mx","kat2.*","kio.ac","kkat.*","kmo.to","la7.it","le.com","lne.es","lnk.lt","lvz.de","m5g.it","mel.fm","met.bz","mexa.*","mmm.dk","msn.cn","nj.com","nnn.de","nos.nl","now.gg","now.us","noz.de","npo.nl","nrz.de","nto.pl","ntv.cx","och.to","oii.io","oii.la","ok.xxx","oke.io","oko.sh","ovid.*","pahe.*","pe.com","pnn.de","poop.*","qq.com","qub.ca","ran.de","rgb.vn","rgl.vn","rtl.de","rtv.de","s.to>>","sab.bz","sfr.fr","shz.de","siz.tv","srt.am","svz.de","t3.com","tek.no","tf1.fr","tfp.is","tii.la","tio.ch","tny.so","top.gg","tpi.li","tv2.no","tvn.pl","tvtv.*","txxx.*","uii.io","upns.*","vido.*","vip.de","vod.pl","voe.sx","vox.de","vsd.fr","waaw.*","waz.de","wco.tv","web.de","xnxx.*","xup.in","xxnx.*","yts2.*","zoro.*","zovo.*","0xxx.ws","10gb.vn","1337x.*","1377x.*","1ink.cc","24pdd.*","4gtv.tv","5278.cc","5play.*","7mmtv.*","7xm.xyz","8tm.net","a-ha.io","adn.com","adsh.cc","adsrt.*","adsy.pw","adyou.*","ahri8.*","ak4eg.*","akoam.*","akw.cam","akwam.*","an1.com","an1me.*","app.com","arbsd.*","atdhe.*","atv.com","bbc.com","beqg.cc","bgr.com","bgsi.gg","bild.de","biqle.*","bol.com","bunkr.*","car.com","cbr.com","cbs.com","chip.de","cine.to","clik.pw","cnn.com","cnys.tv","comix.*","crn.com","crxs.me","csst.at","ctrlv.*","dbna.de","dciuu.*","ddrk.me","deco.fr","delo.bg","digi.no","dirp.me","dlhd.sx","dnj.com","docer.*","doods.*","doood.*","elixx.*","enit.in","eska.pl","exe.app","exey.io","f6s.com","fakt.pl","faz.net","ffcv.es","filmy.*","fomo.id","fox.com","fpo.xxx","gala.de","gala.fr","gats.io","gdtot.*","giga.de","gk24.pl","gntai.*","gnula.*","goku.sx","gomo.to","gotxx.*","govid.*","gp24.pl","grid.id","gs24.pl","gsurl.*","haps.pl","hdvid.*","hdzog.*","hftg.co","igram.*","inc.com","inra.bg","itv.com","j5z.xyz","javhd.*","jizz.us","jmty.jp","joyn.at","joyn.ch","joyn.de","jpg2.su","jpg6.su","jptt.tv","k1nk.co","k511.me","kaas.ro","kfc.com","khsm.io","kijk.nl","kino.de","kinox.*","kinoz.*","koyso.*","ksl.com","ksta.de","kubb.tv","lato.sx","laut.de","leak.sx","link.tl","linkz.*","linx.cc","lnbz.la","lnk2.cc","logi.im","lulu.st","m4uhd.*","mail.de","mdn.lol","mega.nz","mlb.com","mlfbd.*","mlsbd.*","mlwbd.*","moin.de","mopo.de","more.tv","moto.it","moto.pl","movi.pk","mtv.com","myegy.*","n-tv.de","nba.com","nbc.com","netu.ac","news.at","news.bg","news.de","nmac.to","now.com","noxx.to","ntvs.cx","nuvid.*","odum.cl","oe24.at","oggi.it","oload.*","onle.co","onvid.*","opvid.*","oxy.edu","oyohd.*","pelix.*","pes6.es","pfps.gg","pngs.gg","pnj.com","pobre.*","prad.de","qmh.sex","rabo.no","rat.xxx","raw18.*","rgj.com","rmcmv.*","sat1.de","sbot.cf","seehd.*","send.cm","sflix.*","sixx.de","slit.cn","sms24.*","songs.*","spy.com","stape.*","stfly.*","swfr.tv","szbz.de","tj.news","tlin.me","tr.link","ttks.tw","tuba.pl","tube8.*","tune.pk","tvhay.*","tvply.*","tvtv.ca","tvtv.us","u.co.uk","ujav.me","uns.bio","upi.com","upvid.*","vcp.xxx","veev.to","vidd.se","vidhd.*","vidoo.*","vidop.*","vids.st","vidup.*","vipr.im","viu.com","vix.com","viz.com","vkmp3.*","vods.tv","vox.com","vozz.vn","vpro.nl","vsrc.su","vudeo.*","waaaw.*","waaw1.*","welt.de","wgod.co","wiwo.de","wnacg.*","wwd.com","xtits.*","ydr.com","yfsp.tv","yiv.com","ymix.to","yout.pw","ytmp3.*","zeit.de","zeiz.me","zien.pl","0deh.com","123mkv.*","15min.lt","18jav.tv","1flix.to","1mov.lol","20min.ch","2embed.*","2ix2.com","2tencb.*","2urs.com","3prn.com","4anime.*","4cash.me","4khd.com","519.best","520cc.cc","58n1.com","69xx.one","7mmtv.sx","85po.com","9gag.com","9mod.com","9n8o.com","9xflix.*","a2zapk.*","aalah.me","actvid.*","adbull.*","adeth.cc","adfloz.*","adfoc.us","adsup.lk","aetv.com","afly.pro","agefi.fr","al4a.com","alpin.de","anigo.to","anoboy.*","arcor.de","ariva.de","asd.pics","asiaon.*","atxtv.co","auone.jp","av6k.com","avcao.cc","ayo24.id","azsoft.*","babia.to","bbw6.com","bde4.com","bde4.icu","bdiptv.*","bdix.app","bif24.pl","bigfm.de","bilan.ch","bing.com","binged.*","bjhub.me","blick.ch","blick.de","bloxd.io","bmovie.*","bombuj.*","booru.eu","brato.bg","brevi.eu","bunkr.la","bunkrr.*","bzzhr.co","bzzhr.to","canna.to","capshd.*","cataz.to","cety.app","cgaa.org","chd4.com","cima4u.*","cineb.gg","cineb.rs","cinen9.*","citi.com","clk.asia","cnbc.com","cnet.com","comix.to","crichd.*","crone.es","cuse.com","cwtv.com","cybar.to","cykf.net","dahh.net","danet.vn","dazn.com","dbna.com","deano.me","dewimg.*","dfiles.*","dlhd.*>>","doods.to","doodss.*","dooood.*","dosya.co","dump.xxx","ecac.org","eee1.lat","eldia.es","emoji.gg","ervik.as","espn.com","exee.app","exeo.app","exyi.net","f75s.com","fastt.gg","fembed.*","files.cx","files.fm","files.im","filma1.*","finya.de","fir3.net","firmy.cz","flixhq.*","fmovie.*","focus.de","friv.com","fupa.net","fxmag.pl","fyxxr.to","fzlink.*","g9r6.com","ganool.*","garaz.cz","gaygo.tv","gdflix.*","ggjav.tv","gload.to","glodls.*","gogohd.*","gokutv.*","gol24.pl","golem.de","gtavi.pl","gusto.at","hackr.io","haho.moe","hd44.com","hd44.net","hdfull.*","heftig.*","heise.de","hidan.co","hidan.sh","hilaw.vn","hltv.org","howdy.id","hoyme.jp","hpjav.in","hqtv.biz","html.net","huim.com","hulu.com","huya.com","hydrax.*","hyhd.org","iade.com","ibbs.pro","icelz.to","idnes.cz","imgdew.*","imgsen.*","imgsto.*","imgviu.*","index.hr","isi7.net","itdog.cn","its.porn","j91.asia","janjua.*","javgg.me","jkpan.cc","jmanga.*","jotea.cl","kagane.*","kaido.to","katbay.*","kcra.com","kduk.com","keepv.id","kick.com","kizi.com","kloo.com","kmed.com","kmhd.net","kmnt.com","koyi.pub","kpnw.com","ktee.com","ktmx.pro","kukaj.io","kukni.to","kwro.com","l8e8.com","l99j.com","la3c.com","lablue.*","lared.cl","lejdd.fr","levif.be","lin-ks.*","link1s.*","linkos.*","liveon.*","lnk.news","ma-x.org","magesy.*","mail.com","mazpic.*","mcloud.*","mgeko.cc","miro.com","miruro.*","missav.*","mitly.us","mixdrp.*","mixed.de","mkvhub.*","mlsbd.co","mmsbee.*","moms.com","money.bg","money.pl","movidy.*","movs4u.*","mxdm.xyz","mxdrop.*","my1ink.*","my4w.com","myad.biz","mycima.*","n.fcd.su","nanai.tw","ncaa.com","net77.cc","newdmn.*","nhl66.ir","nick.com","nohat.cc","nola.com","notube.*","noy1.top","o8tv.com","ogario.*","orsm.net","oui.sncf","pahe.ink","pasend.*","payt.com","pctnew.*","picks.my","picrok.*","pingit.*","pirate.*","pixlev.*","pluto.tv","plyjam.*","plyvdo.*","poedb.tw","pogo.com","pons.com","porn.com","pornid.*","pornx.to","qa2h.com","quins.us","quoka.de","r2sa.net","racaty.*","radio.at","radio.de","radio.dk","radio.es","radio.fr","radio.it","radio.pl","radio.pt","radio.se","ralli.ee","ranoz.gg","rargb.to","rdxhd1.*","rintor.*","rootz.so","roshy.tv","saint.to","sanet.lc","sanet.st","sb9t.com","sbchip.*","sbflix.*","sbplay.*","sbrulz.*","scmp.com","seeeed.*","self.com","senda.pl","senpa.io","seriu.jp","sex3.com","sexvid.*","shopr.tv","short.pe","shtab.su","shtms.co","shush.se","sj-r.com","sms24.me","so1.asia","sohu.com","splay.id","sport.de","sport.es","sport.pl","spox.com","sptfy.be","stern.de","stfly.me","strtpe.*","sudugu.*","svapo.it","swdw.net","swzz.xyz","sxsw.com","sxyprn.*","t20cup.*","t66y.com","t7meel.*","tasma.ru","tbib.org","tele5.de","thegay.*","thekat.*","thoptv.*","tirexo.*","tmearn.*","tobys.dk","today.it","toggo.de","tokfm.pl","trakt.tv","trend.at","trrs.pro","tstrs.me","tubeon.*","tubidy.*","turbo.cr","turbo.fr","tv.wp.pl","tv247.us","tvepg.eu","tvn24.pl","tvnet.lv","txst.com","udvl.com","uiil.ink","upapk.io","uproxy.*","uqload.*","urbia.de","uvnc.com","v.qq.com","vanime.*","vapley.*","vedbam.*","vedbom.*","vembed.*","venge.io","vibe.com","vid4up.*","vidlo.us","vidlox.*","vidsrc.*","vidup.to","viki.com","vipbox.*","viper.to","viprow.*","virpe.cc","vlive.tv","voe.sx>>","voici.fr","voxfm.pl","vozer.io","vozer.vn","vtbe.net","vtmgo.be","vtube.to","vumoo.cc","vxxx.com","wat32.tv","watch.ug","wcofun.*","wcvb.com","webbro.*","weloma.*","wepc.com","wetter.*","wfmz.com","wkyc.com","woman.at","work.ink","wowtv.de","wp.solar","wplink.*","wttw.com","wykop.pl","wyze.com","x1337x.*","xchina.*","xcum.com","xh.video","xkyn.com","xo7c.com","xvide.me","xxf.mobi","xxr.mobi","xxu.mobi","y2mate.*","yacht.de","yandex.*","yelp.com","yepi.com","youx.xxx","yporn.tv","yt1s.com","yt5s.com","ytapi.cc","ythd.org","z4h4.com","zbporn.*","zdrz.xyz","zee5.com","zooqle.*","zovo.ink","zshort.*","0vg9r.com","10.com.au","10short.*","123av.com","123link.*","123mf9.my","123pan.cn","18xxx.xyz","1milf.com","1stream.*","2024tv.ru","233tw.com","26efp.com","2conv.com","2glho.org","2kmovie.*","2ndrun.tv","3dzip.org","3movs.com","4share.vn","4stream.*","4tube.com","51cg1.com","51sec.org","51zxw.net","5flix.top","5mgz1.com","5movies.*","6jlvu.com","7bit.link","7mm003.cc","7starhd.*","9-gld.net","9anime.pe","9hentai.*","9xbuddy.*","9xmovie.*","a-o.ninja","a2zapk.io","aagag.com","aagmaal.*","abcya.com","acortar.*","adcorto.*","adsfly.in","adshort.*","adurly.cc","aduzz.com","afk.guide","agar.live","ah-me.com","aikatu.jp","airtel.in","akkxs.net","alphr.com","ameblo.jp","andyday.*","anidl.org","animekb.*","animesa.*","anitube.*","aniwave.*","anizm.net","apkmb.com","apkmody.*","apl373.me","apl374.me","apl375.me","appdoze.*","applnn.cc","appvn.com","aram.zone","arc018.to","arcai.com","art19.com","artru.net","asd.homes","atlaq.com","atomohd.*","av1core.*","avtub.*>>","awafim.tv","axjbt.com","aylink.co","azel.info","azmen.com","azrom.net","bakai.org","bdlink.pw","beeg.fund","befap.com","bflix.*>>","bhplay.me","bibme.org","bigwarp.*","biqle.com","bitfly.io","bitlk.com","blackd.de","blkom.com","blog24.me","blogk.com","bmovies.*","boerse.de","bolly4u.*","boost.ink","brainly.*","btdig.com","buffed.de","busuu.com","c1z39.com","cambabe.*","cambb.xxx","cambro.io","cambro.tv","camcam.cc","camcaps.*","camhub.cc","canela.tv","canoe.com","ccurl.net","cda-hd.cc","cdn1.site","cdn77.org","cdrab.com","cfake.com","chatta.it","chyoa.com","cinema.de","cinetux.*","cl1ca.com","clamor.pl","clksz.com","cloudy.pk","cmovies.*","comunio.*","ctrl.blog","curto.win","cutdl.xyz","cybar.xyz","czxxx.org","d000d.com","d0o0d.com","daddyhd.*","daybuy.tw","debgen.fr","dfast.app","dfiles.eu","dflinks.*","dhd24.com","djmaza.my","djstar.in","djx10.org","dlgal.com","do0od.com","do7go.com","dom.wp.pl","domaha.tv","doods.pro","doooood.*","doply.net","dotflix.*","dropmms.*","dropzy.io","drrtyr.mx","drtuber.*","drzna.com","dumpz.net","dvdplay.*","dx-tv.com","dz4soft.*","dzapk.com","eater.com","echoes.gr","efukt.com","efuxs.com","eg4link.*","egybest.*","egydead.*","eltern.de","embedme.*","embedy.me","embtaku.*","emovies.*","enorme.tv","entano.jp","eodev.com","erogen.su","erome.com","eroxxx.us","europix.*","evaki.fun","evo.co.uk","exego.app","expres.cz","eyalo.com","f16px.com","fap16.net","fapnado.*","faps.club","fapxl.com","faselhd.*","fast-dl.*","fc-lc.com","feet9.com","femina.ch","ffjav.com","fifojik.*","file4go.*","fileq.net","filma24.*","filmex.to","finfang.*","flixhd.cc","flixhq.ru","flixhq.to","flixhub.*","flixtor.*","flvto.biz","fmj.co.uk","fmovies.*","fooak.com","forsal.pl","foundit.*","foxhq.com","freep.com","freewp.io","frembed.*","frprn.com","fsbot.xyz","fshost.me","ftopx.com","ftuapps.*","fuqer.com","furher.in","fx-22.com","fxshu.top","gahag.net","gayck.com","gayfor.us","gayxx.net","gazeta.pl","gdirect.*","ggjav.com","gifhq.com","giize.com","glodls.to","gm-db.com","gmanga.me","gofile.to","gojo2.com","gomov.bio","gomoviz.*","goplay.ml","goplay.su","gosemut.*","goshow.tv","gototub.*","goved.org","gowyo.com","goyabu.us","gplinks.*","gry.wp.pl","gsdn.live","gsm1x.xyz","guum5.com","gvnvh.net","hanime.tv","happi.com","haqem.com","hax.co.id","hboav.com","hd-xxx.me","hdfilme.*","hdgay.net","hdhub4u.*","hdrez.com","hdss-to.*","heavy.com","hellnaw.*","hentai.tv","hh3dhay.*","hhesse.de","hianime.*","hideout.*","hitomi.la","hmt6u.com","hoca2.com","hoca6.com","hoerzu.de","hojii.net","hokej.net","hothit.me","hotmovs.*","huavod.cc","hugo3c.tw","huyamba.*","hxfile.co","i-bits.io","ibooks.to","icdrama.*","iceporn.*","idpvn.com","ihow.info","ihub.live","ikaza.net","ilinks.in","imeteo.sk","img4fap.*","imgmaze.*","imgrock.*","imgtown.*","imgur.com","imgview.*","imore.com","imslp.org","ingame.de","intest.tv","inwepo.co","iobit.com","iprima.cz","iqiyi.com","ireez.com","isohunt.*","itpro.com","janjua.tv","jappy.com","jasmr.net","javboys.*","javcl.com","javct.net","javdoe.sh","javfor.tv","javfun.me","javhat.tv","javhd.*>>","javmix.tv","javpro.cc","javsub.my","javup.org","javwide.*","javxxx.me","jkanime.*","job.mt.de","job.nw.de","jootc.com","kagane.to","kali.wiki","karwan.tv","katfile.*","keepvid.*","ki24.info","kick4ss.*","kickass.*","kicker.de","kinoger.*","kissjav.*","klmanga.*","koora.vip","krx18.com","kuyhaa.me","kzjou.com","l2db.info","l455o.com","lecker.de","legia.net","lenkino.*","lesoir.be","linetv.tw","linkfly.*","liveru.sx","ljcam.net","lkc21.net","lmtos.com","lnbzi.com","lnk.parts","loader.fo","loader.to","lodynet.*","lohud.com","lookcam.*","lootup.me","los40.com","m.kuku.lu","m1xdrop.*","m4ufree.*","magma.com","mamadu.pl","mangaku.*","manhwas.*","maniac.de","mapple.tv","marca.com","mavplay.*","mboost.me","mc-at.org","mcrypto.*","mega4up.*","merkur.de","messen.de","mfw09.org","mgnet.xyz","mgread.io","mhn.quest","milfnut.*","miniurl.*","mitele.es","mixdrop.*","mkvcage.*","mkvpapa.*","mlbbox.me","mlive.com","mmo69.com","mobile.de","mod18.com","moeci.com","momzr.com","mov2day.*","mp3clan.*","mp3fy.com","mp3spy.cc","mp3y.info","mpyit.com","mrgay.com","mrjav.net","multi.xxx","murlok.io","mxcity.mx","myaew.com","mynet.com","mz-web.de","nbabox.co","ncdnstm.*","nekopoi.*","netcine.*","neuna.net","news38.de","nhentai.*","niadd.com","nikke.win","nivod2.tv","nkiri.com","nknews.jp","nodejs.cn","notion.so","nowgg.lol","noxx.to>>","nozomi.la","npodoc.nl","nxxn.live","nyaa.land","nydus.org","oatuu.org","obsev.com","ocala.com","ocnpj.com","ofiii.com","ofppt.net","ohmymag.*","ok-th.com","okanime.*","okblaz.me","omavs.com","oosex.net","opjav.com","orunk.com","owlzo.com","oxxfile.*","pahe.plus","palabr.as","palimas.*","pasteit.*","pastes.io","pcwelt.de","pelis28.*","pepar.net","pferde.de","phodoi.vn","phois.pro","picrew.me","pixhost.*","pkembed.*","playav.cc","player.pl","plotek.pl","plylive.*","pogga.org","popjav.in","porn720.*","porner.tv","pornfay.*","pornhat.*","pornhub.*","pornj.com","pornlib.*","porno18.*","porntv.us","pornuj.cz","powvdeo.*","premio.io","profil.at","psarips.*","publio.pl","pugam.com","pussy.org","pynck.com","q1003.com","qcheng.cc","qciss.net","qcock.com","qlinks.eu","qoshe.com","quizz.biz","radio.net","rarbg.how","rdembed.*","readm.org","redd.tube","redisex.*","redtube.*","redwap.me","remaxhd.*","rentry.co","rexporn.*","rexxx.org","rfiql.com","ridge.com","rjno1.com","rock.porn","rokni.xyz","rphost.in","rshrt.com","ruhr24.de","rytmp3.io","s2dfree.*","saint2.cr","samfw.com","satdl.com","sbnmp.bar","sbplay2.*","sbplay3.*","sbsun.com","scat.gold","seazon.fr","seexh.com","series9.*","seulink.*","sexmv.com","sexsq.com","sextb.*>>","sezia.com","sflix.pro","shlly.com","shorten.*","shrdsk.me","shrib.com","shrinke.*","shrtfly.*","skardu.pk","skpb.live","skysetx.*","slate.com","slink.bid","smutr.com","son.co.za","songspk.*","soraraw.*","space.com","spcdn.xyz","sport1.de","srnky.com","sssam.com","ssstik.io","staige.tv","stly.link","strms.net","strmup.cc","strmup.to","strmup.ws","strtape.*","study.com","stvid.com","sudugu.cc","sulasok.*","swame.com","syosetu.*","sythe.org","szene1.at","talaba.su","tamilmv.*","taming.io","tatli.biz","tech5s.co","teensex.*","terabox.*","tfly.link","theav.xyz","themw.com","thesun.ie","thgss.com","thothd.to","thothub.*","tinhte.vn","tnp98.xyz","to.com.pl","today.com","todaypk.*","tojav.net","topflix.*","topjav.tv","torlock.*","tpaste.io","tpayr.xyz","tpz6t.com","trutv.com","tubev.sex","tubexo.tv","tukoz.com","turbo1.co","tvguia.es","tvinfo.de","tvlogy.to","tvporn.cc","txori.com","txxx.asia","ucptt.com","udebut.jp","ufacw.com","uflash.tv","ujszo.com","ulsex.net","unicum.de","upbam.org","upbolt.to","upfiles.*","upiapi.in","uplod.net","uporn.icu","upornia.*","uppit.com","uproxy2.*","upxin.net","upzone.cc","uqload.co","uqozy.com","urlcero.*","ustream.*","uxjvp.pro","v1kkm.com","vdtgr.com","vebo1.com","veedi.com","vg247.com","vid2faf.*","vidara.so","vidara.to","vidbm.com","vidbox.vc","vide0.net","videobb.*","vidfast.*","vidmoly.*","vidneo.cc","vidnest.*","vidplay.*","vidzy.org","vienna.at","vinaurl.*","vinovo.to","vipurl.in","vladan.fr","vnuki.net","vogue.com","voodc.com","vplink.in","vsembed.*","vtlinks.*","vttpi.com","vvid30c.*","vvvvid.it","w3cub.com","webex.com","webmaal.*","webtor.io","wecast.to","wetter.de","wildwap.*","winporn.*","wiour.com","wired.com","wnacg1.cc","woiden.id","world4.eu","wpteq.org","wvt24.top","www.wp.pl","x-tg.tube","x24.video","x99av.com","xbaaz.com","xbabe.com","xca.cymru","xcafe.com","xcity.org","xcoic.com","xcums.com","xecce.com","xexle.com","xfeed.com","xhand.com","xhbig.com","xmovies.*","xpaja.net","xtapes.me","xvideo.cc","xvideos.*","xvipp.com","xxx24.vip","xxxhub.cc","xxxxxx.hu","y2down.cc","yeptube.*","yeshd.net","yjiur.xyz","ymovies.*","youku.com","younetu.*","youporn.*","yt2mp3s.*","ytmp3s.nu","ytpng.net","ytsaver.*","yu2be.com","yufap.com","zataz.com","zdnet.com","zedge.net","zefoy.com","zhihu.com","zjet7.com","zojav.com","zokaj.com","zovo2.top","zrozz.com","0gogle.com","0gomovie.*","10starhd.*","123865.com","123anime.*","123chill.*","13tv.co.il","141jav.com","18tube.sex","1apple.xyz","1bit.space","1kmovies.*","1link.club","1stream.eu","1tamilmv.*","1todaypk.*","2best.club","2the.space","2umovies.*","360lele.cc","3dzip.info","3fnews.com","3hiidude.*","3kmovies.*","3xyaoi.com","4-liga.com","444.coffee","445nan.com","4kporn.xxx","4porn4.com","4tests.com","4tube.live","520call.me","5ggyan.com","5xmovies.*","720pflix.*","85tube.com","8boobs.com","8muses.xxx","8phim1.net","8xmovies.*","91porn.com","96ar.com>>","9908ww.com","9anime.vip","9animes.ru","9kmovies.*","9monate.de","9xmovies.*","9xupload.*","a1movies.*","acefile.co","acortalo.*","adshnk.com","adslink.pw","advtpe.com","aeonax.com","afdah2.com","aiyifan.tv","akmcloud.*","all3do.com","allfeeds.*","alphatv.gr","amboss.com","ameede.com","amindi.org","anchira.to","andani.net","anime4up.*","animedb.in","animeflv.*","animeid.tv","animesup.*","animetak.*","animez.org","anitube.us","aniwatch.*","aniwave.uk","anodee.com","anon-v.com","anroll.net","ansuko.net","antenne.de","anysex.com","apkhex.com","apkmaven.*","apkmody.io","arabseed.*","archive.fo","archive.is","archive.li","archive.md","archive.ph","archive.vn","arcjav.com","areadvd.de","aruble.net","asiansex.*","asiaon.top","asmroger.*","ate9ni.com","atishmkv.*","atomixhq.*","atomtt.com","av01.media","avjosa.com","avtub.cx>>","awpd24.com","axporn.com","ayuka.link","aznude.com","babeporn.*","baikin.net","bakotv.com","balbums.st","bandle.app","bang14.com","bayimg.com","bblink.com","bbw.com.es","bdjobs.com","bdokan.com","bdsmx.tube","bdupload.*","beatree.cn","beeg.party","beeimg.com","bembed.net","bestcam.tv","bigten.org","bildirim.*","bloooog.it","bluetv.xyz","bnnvara.nl","boards.net","boombj.com","borwap.xxx","bos21.site","boyfuck.me","brd.edu.pl","brian70.tw","brides.com","brillen.de","brmovies.*","brstej.com","btvplus.bg","buders.com","bztube.com","caller.com","calvyn.com","camflow.tv","camfox.com","camhoes.tv","camseek.tv","canada.com","capital.de","capital.fr","caq98i.top","cashkar.in","cavallo.de","cboard.net","cdn256.xyz","ceesty.com","cekip.site","cerdas.com","cgtips.org","ciberdvd.*","cidetxt.cc","cimanow.cc","cinehd.app","cityam.com","citynow.it","ckxsfm.com","cluset.com","codare.fun","code.world","cola16.app","colearn.id","comtasq.ca","connect.de","cookni.net","cpscan.xyz","creatur.io","cricfree.*","cricfy.net","crictime.*","crohasit.*","csrevo.com","cuatro.com","cubshq.com","cuckold.it","cuevana.is","cuevana3.*","cutnet.net","cuttty.com","cwseed.com","d0000d.com","d44t95.com","ddownr.com","deezer.com","demooh.com","depedlps.*","desiflix.*","desihub.sh","desimms.co","desired.de","destyy.com","dev2qa.com","dfbplay.tv","dilar.tube","disqus.com","djamix.net","djxmaza.in","dloady.com","do-xxx.com","dogecoin.*","dojing.net","domahi.net","donk69.com","doodle.com","dopebox.to","dorkly.com","douyin.com","downev.com","dpstream.*","dqzboy.com","drakkar.st","drivebot.*","driveup.in","driving.ca","drphil.com","ds.163.com","dtmaga.com","dvm360.com","dz4up1.com","eadt.co.uk","earncash.*","earnload.*","easysky.in","ebc.com.br","ebony8.com","ebookmed.*","ebuxxx.net","edmdls.com","egyup.live","elmundo.es","embed.casa","embedv.net","emsnow.com","emurom.net","enhuku.com","epainfo.pl","eplayvid.*","eplsite.uk","erofus.com","erotom.com","eroxia.com","evileaks.*","evojav.pro","ewybory.eu","exeygo.com","exnion.com","express.de","f1livegp.*","f1stream.*","f2movies.*","f4scdn.com","fabmx1.com","fakaza.com","fake-it.ws","falpus.com","familie.de","fandom.com","fapcat.com","fapdig.com","fapeza.com","fapset.com","faqwiki.us","fastly.net","fautsy.com","fboxtv.com","fbstream.*","festyy.com","ffmovies.*","fhedits.in","fikfak.net","fikiri.net","fikper.com","filedown.*","filemoon.*","fileone.tv","filesq.net","filester.*","film.wp.pl","film1k.com","film4e.com","filmi7.net","filmo.to>>","filmovi.ws","filmweb.pl","filmyfly.*","filmygod.*","filmyhit.*","filmypur.*","filmywap.*","finanzen.*","finclub.in","flickr.com","flixbaba.*","flixhub.co","flybid.net","fmembed.cc","forgee.xyz","formel1.de","foxnxx.com","freeload.*","freenet.de","freevpn.us","friars.com","frogogo.ru","fsplayer.*","fstore.biz","fuckdy.com","fullreal.*","fulltube.*","fullxh.com","funzen.net","funztv.com","fuxnxx.com","fxporn69.*","fzmovies.*","g655p8.com","gadgets.es","game5s.com","gamenv.net","gamepro.de","gatcha.org","gawbne.com","gaydam.net","gcinee.com","gcloud.cfd","gdfile.org","gdmax.site","gdplayer.*","gestyy.com","getnews.jp","gifans.com","giff.cloud","gigaho.com","givee.club","gkbooks.in","gkgsca.com","gleaks.pro","gledaitv.*","gmenhq.com","gnomio.com","go.tlc.com","gocast.pro","gochyu.com","goduke.com","goeags.com","goegoe.net","goerie.com","gofilmes.*","goflix.sbs","gogodl.com","gogoplay.*","gogriz.com","gomovies.*","goodto.com","google.com","gopack.com","gostream.*","goutsa.com","gozags.com","gozips.com","gplinks.co","grasta.net","gtaall.com","gunauc.net","haddoz.net","hamburg.de","hanauer.de","hanime.xxx","hanjuk.com","hao123.com","hardsex.cc","hartico.tv","haustec.de","haxina.com","hbomax.com","hcbdsm.com","hclips.com","hd-tch.com","hdfriday.*","hdporn.net","hdtoday.cc","hdtoday.tv","hdzone.org","hechos.net","hentaihd.*","hentaisd.*","hextank.io","hhkungfu.*","hianime.to","himovies.*","hitprn.com","hivelr.com","hl-live.de","hoca4u.com","hoca4u.xyz","hostxy.com","hotmasti.*","hotovs.com","house.porn","how2pc.com","howifx.com","hqbang.com","huavod.com","huavod.net","huavod.top","hub2tv.com","hubcdn.vip","hubdrive.*","huoqwk.com","hydracdn.*","icegame.ro","iceporn.tv","idevice.me","idlixvip.*","igay69.com","illink.net","ilmeteo.it","imag-r.com","imgair.net","imgbox.com","imgbqb.sbs","imginn.com","imgmgf.sbs","imgpke.sbs","imguee.sbs","indeed.com","indoav.app","indoav.com","indobo.com","inertz.org","infulo.com","ingles.com","ipamod.com","iplark.com","ironysub.*","isbn.co.in","isgfrm.com","issuya.com","itbaoku.cn","itdmusic.*","iumkit.net","iusm.co.kr","iwcp.co.uk","jakondo.ru","japgay.com","japscan.ws","jav-fun.cc","jav.direct","jav247.top","jav380.com","jav777.xyz","javbee.vip","javbix.com","javboys.tv","javbull.tv","javdo.cc>>","javembed.*","javfan.one","javfav.com","javfc2.xyz","javgay.com","javhdz.*>>","javhub.net","javhun.com","javlab.net","javmix.app","javmvp.com","javneon.tv","javnew.net","javopen.co","javpan.net","javpas.com","javplay.me","javqis.com","javrip.net","javroi.com","javseen.tv","javsek.net","jnews5.com","jobsbd.xyz","joktop.com","joolinks.*","josemo.com","jpgames.de","jpvhub.com","jrlinks.in","kaamuu.cfd","kaliscan.*","kamelle.de","kaotic.com","kaplog.com","katlinks.*","kedoam.com","keepvid.pw","kejoam.com","kelaam.com","kendam.com","kenzato.uk","kerapoxy.*","keroseed.*","key-hub.eu","kiaclub.cz","kickass2.*","kickasst.*","kickassz.*","kickbd.org","king-pes.*","kinobox.cz","kinoger.re","kinoger.ru","kinoger.to","kjmx.rocks","kkickass.*","klooam.com","klyker.com","kochbar.de","kompas.com","kompiko.pl","kotaku.com","kropic.com","kvador.com","kxbxfm.com","labgame.io","lacrima.jp","laosu.tech","larazon.es","ldnews.com","leakav.com","leeapk.com","leechall.*","leet365.cc","leolist.cc","lewd.ninja","lglbmm.com","lidovky.cz","likecs.com","line25.com","link1s.com","linkbin.me","linkpoi.me","linkshub.*","linkskat.*","linksly.co","linkspy.cc","linkz.wiki","listatv.pl","live7v.com","livehere.*","livetvon.*","lollty.pro","lookism.me","lootdest.*","lopers.com","love4u.net","loveroms.*","lpl.qq.com","lulust.com","lumens.com","lustich.de","lxmanga.my","m.86kl.com","m.lwxs.com","m2list.com","macwelt.de","magnetdl.*","mahfda.com","mandai.com","mangago.me","mangaraw.*","mangceh.cc","manwan.xyz","mascac.org","mat6tube.*","mathdf.com","maths.news","maxicast.*","mcappx.com","mdplay.top","megadb.net","megadede.*","megaflix.*","megalink.*","megaup.net","megaxh.com","meltol.net","meong.club","mhdtvmax.*","miixdrop.*","milfzr.com","mitaku.net","mixdroop.*","mlbb.space","mma-core.*","mmnm.store","mmopeon.ru","mmtv01.xyz","molotov.tv","mongri.net","motchill.*","moto.wp.pl","movie123.*","movie4me.*","moviegan.*","moviehdf.*","moviemad.*","movies07.*","movies2k.*","movies4u.*","movies7.to","moviflex.*","movix.blog","mozkra.com","mp3cut.net","mp3guild.*","mp3juice.*","mpnnow.com","mrds66.com","mreader.co","mrpiracy.*","mtlurb.com","mult34.com","multics.eu","multiup.eu","multiup.io","musichq.cc","my-subs.co","mydaddy.cc","myjest.com","mykhel.com","mylust.com","myplexi.fr","myqqjd.com","myvideo.ge","myviid.com","naasongs.*","nackte.com","naijal.com","nakiny.com","namasce.pl","namemc.com","namiko.net","napmap.net","nbabite.to","nbaup.live","ncdnx3.xyz","negumo.com","neonmag.fr","neoteo.com","neowin.net","netfree.cc","new.qq.com","newhome.de","newpelis.*","news18.com","newser.com","nexdrive.*","nexttv.com","nflbite.to","ngelag.com","ngomek.com","ngomik.net","nhentai.io","nickles.de","ninguno.cc","nivod2.com","nivod4.com","nivod5.com","niyaniya.*","nmovies.cc","noanyi.com","nocfsb.com","nohost.one","nosteam.ro","note1s.com","notube.com","novinky.cz","noz-cdn.de","nsfw247.to","ntucgm.com","nudes7.com","nullpk.com","nunuju.net","nuroflix.*","nxprime.in","nypost.com","odporn.com","odtmag.com","ofwork.net","ohorse.com","ohueli.net","ojworld.it","okleak.com","okmusi.com","okteve.com","onehack.us","oneotv.com","onepace.co","onepunch.*","onezoo.net","onloop.pro","onmovies.*","onvista.de","openload.*","oploverz.*","origami.me","orirom.com","otomoto.pl","owsafe.com","paminy.com","parade.com","parents.at","pawchive.*","pbabes.com","pc-guru.it","pcbeta.com","pcgames.de","pctfenix.*","pcworld.es","pdfaid.com","peetube.cc","phc.web.id","phim85.com","picmsh.sbs","pictoa.com","pidlio.com","pilsner.nu","pingit.com","pinkun.com","pirlotv.mx","pitube.net","pixelio.de","pixnet.net","pixvid.org","pjstar.com","plaion.com","planeta.pl","planhub.ca","playboy.de","playfa.com","playgo1.cc","plc247.com","plejada.pl","poapan.xyz","pondit.xyz","poophq.com","popcdn.day","poplinks.*","poranny.pl","porn00.org","porn87.com","porndr.com","pornfd.com","porngo.com","porngq.com","pornhd.com","pornhd8k.*","pornky.com","porntb.com","porntn.com","pornve.com","pornwex.tv","pornx.tube","pornxp.com","pornxp.org","pornxs.com","pouvideo.*","povvideo.*","povvldeo.*","povw1deo.*","povwideo.*","powder.com","powlideo.*","powv1deo.*","powvibeo.*","powvideo.*","powvldeo.*","premid.app","progfu.com","prosongs.*","proxybit.*","proxytpb.*","prydwen.gg","psychic.de","ptztv.live","pudelek.pl","puhutv.com","putlog.net","qqxnxx.com","qrixpe.com","qthang.net","quicomo.it","radio.zone","raenonx.cc","rakuten.tv","ranker.com","rawinu.com","rawlazy.si","realgm.com","rebahin.pw","redfea.com","redgay.net","reeell.com","regio7.cat","rencah.com","reshare.pm","rgeyyddl.*","rgmovies.*","riazor.org","rlxoff.com","rmdown.com","roblox.com","rodude.com","romsget.io","ronorp.net","roshy.tv>>","rrstar.com","rule34.art","rule34.xxx","rule34.xyz","rule34ai.*","rumahit.id","s1p1cd.com","s2dfree.to","s3taku.com","sakpot.com","salina.com","samash.com","sanblo.com","savego.org","sawwiz.com","sbrity.com","sbs.com.au","scribd.com","sctoon.net","scubidu.eu","seeflix.to","serien.cam","seriesly.*","sevenst.us","sexato.com","sexjobs.es","sexkbj.com","sexlist.tv","sexodi.com","sexpin.net","sexpox.com","sexrura.pl","sextor.org","sextvx.com","sfile.mobi","shahid4u.*","shinden.pl","shineads.*","shlink.net","sholah.net","shophq.com","shorttey.*","shortx.net","shortzzy.*","showflix.*","shrink.icu","shrinkme.*","shrt10.com","sibtok.com","sikwap.xyz","silive.com","simpcity.*","smoner.com","snbc13.com","snopes.com","snowmtl.ru","soap2day.*","socebd.com","sohot.cyou","sokobj.com","solewe.com","sourds.net","soy502.com","spaste.com","spiegel.de","spielen.de","sportal.de","sportbar.*","sports24.*","srvy.ninja","ssdtop.com","sshkit.com","ssyou.tube","stardima.*","stemplay.*","stiletv.it","stpm.co.uk","strcloud.*","streamsb.*","streamta.*","strefa.biz","suaurl.com","sunhope.it","supra6.com","surfer.com","surirt.com","szene38.de","tapetus.pl","target.com","taxi69.com","tcpalm.com","tcpvpn.com","tech.wp.pl","tech8s.net","techhx.com","telerium.*","texte.work","th-cam.com","thatav.net","theacc.com","thecut.com","thedaddy.*","theporn.cc","theproxy.*","thevidhd.*","thosa.info","thothd.com","thripy.com","tickzoo.tv","tiktok.com","tingfm.com","tiscali.it","tmnews.com","tokuvn.com","tokuzl.net","toorco.com","topito.com","toppng.com","torlock2.*","torrent9.*","tranny.one","trust.zone","trzpro.com","tsubasa.im","tsz.com.np","tubesex.me","tubous.com","tubsexer.*","tubtic.com","tugaflix.*","tulink.org","tumblr.com","tunein.com","turbovid.*","tutelehd.*","tutsnode.*","tutwuri.id","tuxnews.it","tvline.com","tvnz.co.nz","tvtoday.de","twatis.com","uctnew.com","uindex.org","uiporn.com","unito.life","uol.com.br","up-load.io","upbaam.com","updato.com","updown.cam","updown.fun","updown.icu","upfion.com","upicsz.com","uplinkto.*","uploadev.*","uploady.io","uporno.xxx","uprafa.com","ups2up.fun","upskirt.tv","uptobhai.*","uptomega.*","urlpay.net","usagoals.*","userload.*","usgate.xyz","usnews.com","ustimz.com","ustream.to","utreon.com","uupbom.com","vadbam.com","vadbam.net","vadbom.com","vcloud.lol","vcstar.com","vdbtm.shop","vecloud.eu","veganab.co","veplay.top","vevioz.com","vgames.fun","vgmlinks.*","vidapi.xyz","vidaraa.cc","vidbam.org","vidbox.dev","vidcloud.*","vidcorn.to","vidembed.*","videyx.cam","videzz.net","vidlii.com","vidnest.io","vidohd.com","vidomo.xyz","vidoza.net","vidply.com","viduro.top","viduyy.com","viewfr.com","vikacg.com","vipboxtv.*","vipotv.com","vipstand.*","vivatube.*","vizcloud.*","vod.tvp.pl","vortez.net","vrporn.com","vstream.id","vvide0.com","vvtlinks.*","wandhi.com","wapkiz.com","warcok.xyz","warezcdn.*","warps.club","watch32.sx","watch4hd.*","watcho.com","watchug.to","watchx.top","wawacity.*","weather.us","web1s.asia","webcafe.bg","weshare.is","weszlo.com","wetter.com","wetter3.de","wikwiki.cv","wintub.com","wnacg05.cc","woiden.com","wooflix.tv","worder.cat","woxikon.de","ww9g.com>>","www.cc.com","www.qq.com","x-x-x.tube","xanimu.com","xasiat.com","xberuang.*","xhamster.*","xhopen.com","xhspot.com","xhtree.com","xhvid1.com","xiaopan.co","xmorex.com","xmovie.pro","xmovies8.*","xnxx.party","xpicse.com","xprime4u.*","xprivo.com","xrares.com","xsober.com","xspiel.com","xsz-av.com","xszav.club","xvideis.cc","xxgasm.com","xxmovz.com","xxxdan.com","xxxfiles.*","xxxmax.net","xxxrip.net","xxxsex.pro","xxxtik.com","xxxtor.com","xxxxsx.com","y2mate.com","y2tube.pro","yomovies.*","youapk.net","youmath.it","youpit.xyz","youwatch.*","yseries.tv","ystream.id","ytanime.tv","ytboob.com","ytjar.info","ytmp4.live","yts-subs.*","yumacs.com","yuppow.com","yuvutu.com","yy1024.net","z12z0vla.*","zeefiles.*","zilinak.sk","zillow.com","zoechip.cc","zoechip.gg","zpaste.net","zthots.com","0123movie.*","0gomovies.*","0rechner.de","1090ys8.com","10alert.com","111watcho.*","11xmovies.*","123animes.*","123movies.*","12thman.com","141tube.com","173.249.8.3","17track.net","18comic.org","18comic.vip","1movieshd.*","2gomovies.*","2rdroid.com","3bmeteo.com","3d-porn.org","3dmgame.com","3dyasan.com","3hentai.net","3xfaktor.hu","423down.com","4funbox.com","4gousya.net","4players.de","4pornhd.com","4shared.com","4spaces.org","4tymode.win","5j386s9.sbs","69games.xxx","69shumi.com","7review.com","7starmv.com","80-talet.se","88files.net","8tracks.com","91porna.com","9animetv.to","9goals.live","9jarock.org","a-hentai.tv","aagmaal.com","abs-cbn.com","abstream.to","ad-doge.com","ad4msan.com","adictox.com","adisann.com","adshrink.it","afilmywap.*","africue.com","afrodity.sk","ahmedmode.*","aiailah.com","aipebel.com","akirabox.to","allkpop.com","almofed.com","almursi.com","altcryp.com","alttyab.net","analdin.com","anavidz.com","andiim3.com","anibatch.me","anichin.top","anigogo.net","anihq.org>>","animahd.com","anime-i.com","anime3d.xyz","animeblix.*","animecix.tv","animehay.tv","animehub.ac","animepahe.*","animesex.me","anisaga.org","anitube.vip","aniwixi.xyz","aniworld.to","anomize.xyz","anonymz.com","anxcinema.*","anyporn.com","anysex.club","aofsoru.com","aosmark.com","apkdink.com","apkhihe.com","apkshrt.com","apksvip.com","aplus.my.id","app.plex.tv","apritos.com","aquipelis.*","arabstd.com","arabxnx.com","arakpop.net","arbweb.info","area51.porn","arenabg.com","artnews.com","asia2tv.com","asianal.xyz","asiangay.tv","asianload.*","asianplay.*","ask4movie.*","asmr18.fans","asmwall.com","asumesi.com","aternos.org","ausfile.com","auszeit.bio","autobild.de","autokult.pl","automoto.it","autopixx.de","autoroad.cz","autosport.*","avanti24.pl","avcesar.com","avitter.net","axomtube.in","ayatoon.com","azmath.info","azmovies.to","b2bhint.com","b4ucast.com","babaktv.com","babeswp.com","babyclub.de","badjojo.com","badtaste.it","barfuck.com","batcave.biz","batman.city","bbwfest.com","bcmanga.com","bdcraft.net","bdmusic23.*","bdmusic28.*","bdsmporn.cc","beelink.pro","beinmatch.*","berich8.com","berklee.edu","bfclive.com","bg-gledai.*","bi-girl.net","bigconv.com","bigojav.com","bigpixel.cn","bigshare.io","bigwank.com","bikemag.com","bingfeng.tw","bitco.world","bitlinks.pw","bitzite.com","blogue.tech","blu-ray.com","blurayufr.*","bokepxv.com","bolighub.dk","bollyflix.*","book18.fans","bootdey.com","bowfile.com","boxporn.net","braflix.win","brbeast.com","brbushare.*","brigitte.de","bristan.com","browser.lol","bsierad.com","btcbitco.in","btvsport.bg","btvsports.*","buondua.com","buzzfeed.at","buzzfeed.de","buzzpit.net","bx-zone.com","bypass.city","bypass.link","bz88888.net","cafenau.com","camclips.tv","camsclips.*","camslib.com","camwhores.*","canaltdt.es","carbuzz.com","ch-play.com","chatgbt.one","chatgpt.com","chefkoch.de","chicoer.com","chochox.com","cima-club.*","cinecloud.*","cinefreak.*","civicxi.com","civitai.com","civitai.red","claimrbx.gg","clapway.com","clkmein.com","cloubix.com","cloudfam.io","clp126.shop","club386.com","cocorip.net","coldfrm.org","collater.al","colnect.com","comicxxx.eu","commands.gg","comnuan.com","comohoy.com","converto.io","coomer1.net","corneey.com","corriere.it","cpmlink.net","cpmlink.pro","crackle.com","crazydl.net","crdroid.net","crvsport.ru","csurams.com","cubuffs.com","cuevana.pro","cults3d.com","cupra.forum","cut-fly.com","cutearn.net","cutlink.net","cutyion.com","daddyhd.*>>","daddylive.*","daftsex.biz","daftsex.net","daftsex.org","daij1n.info","dailyweb.pl","damitv.live","daozoid.com","ddlvalley.*","decider.com","decrypt.day","deltabit.co","devotag.com","dexerto.com","digit77.com","digitask.ru","direct-dl.*","discord.com","disheye.com","diudemy.com","divxtotal.*","dj-figo.com","djqunjab.in","dlpanda.com","dlstreams.*","dma-upd.org","dogdrip.net","donlego.com","dotycat.com","doumura.com","douploads.*","downsub.com","dozarte.com","dramacool.*","dramamate.*","dramanice.*","drawize.com","droplink.co","ds2play.com","dsharer.com","dstat.space","dsvplay.com","duboku.info","dudefilms.*","dz4link.com","dziennik.pl","e-glossa.it","earnbee.xyz","earnhub.net","easy-coin.*","easybib.com","ebookdz.com","echiman.com","echodnia.eu","ecomento.de","edjerba.com","edp24.co.uk","eductin.com","edziecko.pl","einthusan.*","ekamus.info","elahmad.com","embasic.pro","embedhd.org","embedmoon.*","embedpk.net","embedtv.net","empflix.com","emudesk.com","emuenzen.de","enagato.com","eoreuni.com","eponuda.com","eporner.com","erciyan.com","eroasmr.com","erogames.to","erothots.co","erowall.com","esgeeks.com","eshentai.tv","eskarock.pl","eslfast.com","europixhd.*","everand.com","everia.club","everyeye.it","exalink.fun","exeking.top","exeporn.net","ezmanga.net","f51rm.com>>","facet.wp.pl","fapdrop.com","fapguru.com","faptube.com","farescd.com","fastdokan.*","fastream.to","fastssh.com","fbstream.is","fbstreams.*","fchopin.net","fembedx.top","feyorra.top","fffmovies.*","figtube.com","file-me.top","file-up.org","file4go.com","file4go.net","filecloud.*","filecrypt.*","filelions.*","filemooon.*","filepress.*","fileq.games","fileroy.com","filesamba.*","filmcdn.top","filmez.club","filmisub.cc","films5k.com","filmy-hit.*","filmy4web.*","filmydown.*","filmygod6.*","findjav.com","firefile.cc","fit4art.com","flixrave.me","flixsix.com","fluentu.com","fluvore.com","fmovies0.cc","fmoviesto.*","folkmord.se","foodxor.com","footybite.*","forqueen.cz","forumdz.com","fosters.com","foumovies.*","foxtube.com","free.com.tw","freenem.com","freepik.com","frpgods.com","fseries.org","fsx.monster","ftuapps.dev","fuckfuq.com","funcrot.net","futemax.zip","g-porno.com","gal-dem.com","gamcore.com","game-2u.com","game3rb.com","gameblog.in","gameblog.jp","gamedrive.*","gamehub.cam","gamelab.com","gamer18.net","gamestar.de","gameswelt.*","gametop.com","gamewith.jp","gamezone.de","gamezop.com","garaveli.de","gaytail.com","gayvideo.me","gazzetta.gr","gazzetta.it","gcloud.live","gedichte.ws","genialne.pl","genpick.app","get-to.link","getmega.net","getthit.com","gevestor.de","ggbases.com","girlmms.com","girlshd.xxx","gisarea.com","gitizle.vip","gizmodo.com","globetv.app","go.fakta.id","go.zovo.ink","goalup.live","gobison.com","gocards.com","gocast2.com","godeacs.com","godmods.com","godtube.com","goducks.com","gofilms4u.*","gofrogs.com","gogifox.com","gogoanime.*","goheels.com","gojacks.com","gokerja.net","golobos.com","gomovies.pk","gomoviesc.*","goodporn.to","gooplay.net","gorating.in","gosexy.mobi","gostyn24.pl","goto.com.np","gotocam.net","gotporn.com","govexec.com","grafikos.cz","gsmware.com","guhoyas.com","gulf-up.com","gumtree.com","gupload.xyz","h-flash.com","haaretz.com","hagalil.com","hagerty.com","hardgif.com","hartziv.org","haxmaps.com","haxnode.net","hblinks.pro","hdbraze.com","hdeuropix.*","hdmotori.it","hdmozi.hu>>","hdonline.co","hdpicsx.com","hdpornt.com","hdtodayz.to","hdtube.porn","helmiau.com","hentai20.io","hentaila.tv","herexxx.com","herzporno.*","hes-goals.*","hexload.com","hhdmovies.*","himovies.sx","hindi.trade","hiphopa.net","history.com","hitokin.net","hmanga.asia","holavid.com","hoofoot.net","hoporno.net","hornpot.net","hornyfap.tv","hornyhill.*","hotabis.com","hotbabes.tv","hotcars.com","hotfm.audio","hotgirl.biz","hotleak.vip","hotleaks.tv","hotscope.tv","hotscopes.*","hotshag.com","hotstar.com","hsq233.shop","htrnews.com","htsport.org","huanqiu.com","huaren.live","hubdrive.de","hubison.com","hubstream.*","hubzter.com","hurawatch.*","huskers.com","huurshe.com","hwreload.it","hygiena.com","hypesol.com","icgaels.com","idlixku.com","iegybest.co","iframejav.*","iggtech.com","igorslab.de","iimanga.com","ikanbot.com","iklandb.com","imageweb.ws","imgbvdf.sbs","imgcloud.pw","imgjjtr.sbs","imgnngr.sbs","imgoebn.sbs","imgoutlet.*","imgtaxi.com","imgyhq.shop","in91vip.win","infocorp.io","infokik.com","inkapelis.*","ipa-apps.me","iporntv.net","iptvbin.com","irunfar.com","isaimini.ca","isosite.org","ispunlock.*","itpro.co.uk","itudong.com","iv-soft.com","jaiefra.com","japanfuck.*","japanporn.*","japansex.me","japscan.lol","jav224.shop","javbake.com","javball.com","javbobo.com","javboys.com","javcock.com","javdock.com","javdoge.com","javfull.net","javgrab.com","javhoho.com","javideo.net","javlion.xyz","javmenu.com","javmeta.com","javmilf.xyz","javpool.com","javsex.guru","javstor.com","javx357.com","javynow.com","jcutrer.com","jeep-cj.com","jetanimes.*","jetpunk.com","jezebel.com","jianshu.com","jkanime.net","jkptgbf.xyz","jnovels.com","jobnoid.net","jobsibe.com","jocooks.com","jotapov.com","jpg.fishing","jra.jpn.org","jungyun.net","jxoplay.xyz","kaembed.net","karanpc.com","kashtanka.*","kb.arlo.com","khohieu.com","kiaporn.com","kickassgo.*","kiemlua.com","kimoitv.com","kinoking.cc","kissanime.*","kissasia.cc","kissasian.*","kisscos.net","kissmanga.*","kjanime.net","klettern.de","kmansin09.*","kochamjp.pl","kodaika.com","kolyoom.com","komikcast.*","kompoz2.com","kpkuang.org","kppk983.com","ksuowls.com","kumaraw.com","l23movies.*","l2crypt.com","labstory.in","laposte.net","lapresse.ca","lastampa.it","latimes.com","latitude.to","latlong.net","lbprate.com","leaknud.com","letras2.com","lewdweb.net","lewebde.com","lfpress.com","lgcnews.com","lgwebos.com","libertyvf.*","lifeline.de","liflix.site","ligaset.com","likemag.com","linclik.com","linegee.net","link-to.net","linkmake.in","linkrex.net","links-url.*","linksfire.*","linkshere.*","linksmore.*","lite-link.*","loanpapa.in","lokalo24.de","lookimg.com","lookmovie.*","losmovies.*","losporn.org","lostineu.eu","lovefap.com","lscomic.com","luluvdo.com","luluvid.com","luxmovies.*","m.13xsw.com","m.91zww.com","m.akkxs.net","m.iqiyi.com","m.nivod2.tv","m.nivod4.tv","m.nivod5.tv","m.nivod7.tv","m.nivod8.tv","m.nivod9.tv","m.youku.com","m1xdrop.com","m1xdrop.net","m4maths.com","made-by.org","madoohd.com","madouqu.com","magesy.blog","magesypro.*","mamastar.jp","mandiner.hu","manga1000.*","manga1001.*","mangahub.io","mangasail.*","mangatv.net","mangayy.org","manhwa18.cc","masa-web.jp","maths.media","mature4.net","mavanimes.*","mavavid.com","maxstream.*","mcdlpit.com","mchacks.net","mcloud.guru","mcxlive.org","medisite.fr","mega1080p.*","megafile.io","megavideo.*","mein-mmo.de","melodelaa.*","mephimtv.cc","mercari.com","messitv.net","messitv.org","metavise.in","mfulbvu.xyz","mgoblue.com","mhdsports.*","mhscans.com","miiixdrop.*","miklpro.com","mirrorace.*","mirrored.to","mlbstream.*","mmfenix.com","mmsmaza.com","mobifuq.com","moenime.com","momomesh.tv","momondo.com","momvids.com","moonembed.*","moonmov.pro","motohigh.pl","motphimr.io","moviebaaz.*","movied.link","movieku.ink","movieon21.*","movieplay.*","movieruls.*","movierulz.*","movies123.*","movies4me.*","movies4u3.*","moviesda4.*","moviesden.*","movieshub.*","moviesjoy.*","moviesmod.*","moviesmon.*","moviesub.is","moviesx.org","moviewr.com","moviezwap.*","movizland.*","mp3-now.com","mp3juices.*","mp3yeni.org","mp4moviez.*","mpo-mag.com","mr9soft.com","mrunblock.*","mtb-news.de","mtlblog.com","muchfap.com","multiup.org","muthead.com","muztext.com","mycloudz.cc","myflixerz.*","mygalls.com","mymp3song.*","mytoolz.net","myunity.dev","myvalley.it","myvidmate.*","myxclip.com","narcity.com","nbabox.co>>","nbastream.*","nbch.com.ar","nbcnews.com","needbux.com","needrom.com","nekopoi.*>>","nelomanga.*","nemenlake.*","neopets.com","netfapx.com","netflix.com","netfuck.net","netplayz.ru","netxwatch.*","netzwelt.de","news.qq.com","newscon.org","newsmax.com","nextgov.com","nflbite.com","nflstream.*","nhentai.net","nhlstream.*","nicekkk.com","nichapk.com","nimegami.id","nkreport.jp","notandor.cn","novelism.jp","novohot.com","novojoy.com","nowiny24.pl","nowmovies.*","nrj-play.fr","nsfwr34.com","nudevista.*","nulakers.ca","nunflix.org","nunuyy3.org","nyahentai.*","nysainfo.pl","odiasia.sbs","ofilmywap.*","ogomovies.*","ohentai.org","ohmymag.com","okstate.com","olarila.com","omuzaani.me","onhockey.tv","onifile.com","onlyfans.to","onneddy.com","ontools.net","onworks.net","optimum.net","ortograf.pl","osxinfo.net","otakudesu.*","otakuindo.*","oubghas.xyz","outletpic.*","overgal.com","overtake.gg","ovester.com","oxanime.com","p2pplay.pro","pagesix.com","paketmu.com","papahd.club","papalah.com","paradisi.de","parispi.net","pasokau.com","pawchive.pw","payskip.org","pcbolsa.com","pcgamer.com","pdfsite.net","pelisplus.*","peppe8o.com","perelki.net","pesktop.com","pewgame.com","pezporn.com","phim1080.in","pianmanga.*","picbqqa.sbs","picnft.shop","picngt.shop","picuenr.sbs","pilot.wp.pl","pinkporno.*","pinterest.*","piratebay.*","pistona.xyz","pitiurl.com","pixjnwe.sbs","pixsera.net","pksmovies.*","pkspeed.net","play.tv3.ee","play.tv3.lt","play.tv3.lv","playmate.to","playrust.io","playtamil.*","playtube.tv","plus.rtl.de","pngitem.com","pngreal.com","pogolinks.*","pokopow.com","polygon.com","pomorska.pl","pooembed.eu","porcore.com","porn3dx.com","porn77.info","porn78.info","porndaa.com","porndex.com","porndig.com","porndoe.com","porndude.tv","porngem.com","porngun.net","pornhex.com","pornkai.com","pornken.com","pornkino.cc","pornktube.*","pornmam.com","pornmom.net","porno-365.*","pornoman.pl","pornomoll.*","pornone.com","pornovka.cz","pornoxo.com","pornpaw.com","pornsai.com","porntin.com","porntry.com","pornult.com","poscitech.*","povvvideo.*","powstream.*","powstreen.*","primesrc.me","primewire.*","prisjakt.no","promobil.de","pronpic.org","pulpo69.com","pupuweb.com","purplex.app","putlocker.*","pvip.gratis","pxtech.site","qdembed.com","quizack.com","quizlet.com","radamel.icu","radiozet.pl","rainanime.*","raw1001.net","rawfree.top","rawkuma.com","rawkuma.net","rawkuro.net","readfast.in","readmore.de","realbbc.xyz","redding.com","redgifs.com","redlion.net","redporno.cz","redtub.live","redwap2.com","redwap3.com","reifporn.de","rekogap.xyz","repelis.net","repelisgt.*","repelishd.*","repelisxd.*","repicsx.com","resetoff.pl","rethmic.com","retrotv.org","reuters.com","reverso.net","riedberg.tv","rimondo.com","rl6mans.com","rlshort.com","roadbike.de","rocklink.in","rogoyume.jp","romfast.com","romsite.org","romviet.com","rphangx.net","rpmplay.xyz","rpupdate.cc","rubystm.com","rubyvid.com","rugby365.fr","rule34h.com","runmods.com","rvguide.com","ryxy.online","s0ft4pc.com","saekita.com","safelist.eu","sailnet.com","sandrives.*","sankaku.app","sansat.link","sararun.net","sat1gold.de","satcesc.com","savelinks.*","savemedia.*","savetub.com","sbbrisk.com","sbchill.com","scenedl.org","scenexe2.io","schadeck.eu","sciagnij.pl","scripai.com","sctimes.com","sdefx.cloud","secuhex.com","see-xxx.com","semawur.com","sembunyi.in","sendvid.com","seoworld.in","serengo.net","serially.it","seriemega.*","seriesflv.*","seselah.com","sexavgo.com","sexdiaryz.*","sexemix.com","sexetag.com","sexmoza.com","sexpuss.org","sexrura.com","sexsaoy.com","sexuhot.com","sexygirl.cc","shaheed4u.*","sharclub.in","sharedisk.*","sharing.wtf","shavetape.*","shikotch.in","shortearn.*","shrinkus.tk","shrlink.top","sigtalk.com","simsdom.com","siteapk.net","sitepdf.com","sixsave.com","skybap.shop","smarturl.it","smplace.com","snaptik.app","socks24.org","soft112.com","softrop.com","solobari.it","soninow.com","sosuroda.pl","soundpark.*","souqsky.net","southpark.*","spambox.xyz","spankbang.*","speakev.com","speedporn.*","spinbot.com","sporcle.com","sport365.fr","sportbet.gr","sportcast.*","sportlive.*","sportshub.*","spycock.com","srcimdb.com","sreality.cz","ssoap2day.*","ssrmovies.*","staaker.com","stagatv.com","starmusiq.*","steamgg.net","steamplay.*","steanplay.*","sterham.net","stickers.gg","stmruby.com","strcloud.in","streamcdn.*","streamed.su","streamers.*","streamhoe.*","streamhub.*","streamix.so","streamm4u.*","streamup.ws","strikeout.*","strp2p.site","subdivx.com","subedlc.com","submilf.com","subsvip.com","sukuyou.com","sundberg.ws","sushiscan.*","svrider.com","swatalk.com","swtimes.com","t-online.de","tabootube.*","tagblatt.ch","takimag.com","tamilyogi.*","tandess.com","taodung.com","tattle.life","tcheats.com","tdtnews.com","teachoo.com","teamkong.tk","techforu.in","technews.tw","tecnomd.com","telenord.it","teltarif.de","tempr.email","terabox.fun","teralink.me","testedich.*","thapcam.net","thaript.com","the-sun.com","thelanb.com","theroot.com","thespun.com","thestar.com","theweek.com","thisvid.com","thotcity.su","thotporn.tv","thotsbay.tv","threads.com","threads.net","tikmate.app","titantv.com","titulky.com","tmailor.com","tnaflix.com","todaypktv.*","tonspion.de","toolxox.com","toonanime.*","toonily.com","topgear.com","topmovies.*","topshare.in","topsport.bg","totally.top","toxicwap.us","trahino.net","tranny6.com","trgtkls.org","tribuna.com","trickms.com","trilog3.net","trxking.xyz","tryvaga.com","ttp229.shop","ttsfree.com","tubator.com","tube18.sexy","tuberel.com","tubsxxx.com","tukoz.com>>","turkmmo.com","tutflix.org","tutvlive.ru","tv-media.at","tv.bdix.app","tvableon.me","tvojstyl.sk","tvseries.in","tw-calc.net","twitchy.com","twitter.com","ubbulls.com","ucanwatch.*","ufcstream.*","uhdmovies.*","uiiumovie.*","uknip.co.uk","umbooks.com","umterps.com","unblockit.*","uozzart.com","up-shop.org","updown.link","upfiles.app","uploadbaz.*","uploadhub.*","uploadrar.*","upns.online","uproxy2.biz","uprwssp.org","upstore.net","upstream.to","uptime4.com","uptobox.com","urdubolo.pk","usfdons.com","usgamer.net","ustvgo.live","uticaod.com","uyeshare.cc","v.ifeng.com","v.youku.com","v2movies.me","v6embed.xyz","variety.com","vaughn.live","vectorx.top","vedshar.com","vegamovie.*","ver-pelis.*","verizon.com","veronica.uk","vexfile.com","vexmovies.*","vf-film.net","vgamerz.com","vidavra.com","vidbeem.com","vidcloud9.*","videezy.com","vidello.net","videovard.*","videoxxx.cc","videplay.us","videq.cloud","vidfast.pro","vidlink.pro","vidload.net","vidnest.fun","vidshar.org","vidshare.tv","vidspeed.cc","vidsrcme.ru","vidstream.*","vidtube.one","vikatan.com","vikuy.click","vip-box.app","vipifsa.com","vipleague.*","vipracing.*","vipshort.in","vipstand.se","viptube.com","virabux.com","visalist.io","visible.com","viva100.com","vixcloud.co","vizcloud2.*","vkprime.com","voirfilms.*","voyeurhit.*","vrcmods.com","vstdrive.in","vulture.com","vvtplayer.*","vw-page.com","vxetable.cn","w.grapps.me","wakuraw.com","waploaded.*","watchfree.*","watchporn.*","wayfair.com","wcostream.*","weadown.com","weather.com","webcras.com","webfail.com","webflix.bio","webrick.com","webtoon.xyz","weights.com","wetsins.com","weviral.org","wgzimmer.ch","why-tech.it","wideo.wp.pl","wildwap.com","winshell.de","wintotal.de","wmovies.xyz","woffxxx.com","wonporn.com","wowroms.com","wupfile.com","wvt.free.nf","www.msn.com","wyborcza.pl","x-x-x.video","x.ag2m2.cfd","xbokeps.com","xcandid.vip","xemales.com","xflixbd.com","xforum.live","xfreehd.com","xgroovy.com","xhamster.fm","xhamster1.*","xhamster2.*","xhamster3.*","xhamster4.*","xhamster5.*","xhamster7.*","xhamster8.*","xhmoon5.com","xhreal2.com","xhreal3.com","xhtotal.com","xhwide5.com","xl02.com.de","xmateur.com","xmovies08.*","xnxxcom.xyz","xozilla.xxx","xpicu.store","xpornzo.com","xpshort.com","xsanime.com","xubster.com","xvideos.com","xx.knit.bid","xxxmomz.com","xxxmovies.*","xxxshut.com","xztgl.com>>","y-2mate.com","y2meta.mobi","yamsoti.com","yesmovies.*","yesporn.vip","yestech.xyz","yifysub.net","ymovies.vip","yomovies1.*","yoshare.net","youjizz.com","youneed.win","youshort.me","youtube.com","youziks.com","yoxplay.xyz","yt2conv.com","ytmp3cc.net","ytsubme.com","yumeost.net","yupflix.com","yupflix.org","yurn.online","zedporn.com","zeilink.net","zemporn.com","zerioncc.pl","zerogpt.com","zetporn.com","ziperto.com","zlpaste.net","zoechip.com","zyromod.com","0123movies.*","0cbcq8mu.com","0l23movies.*","0ochi8hp.com","10-train.com","1024tera.com","103.74.5.104","123-movies.*","1234movies.*","123animes.ru","123moviesc.*","123moviess.*","123unblock.*","1340kbbr.com","16honeys.com","185.53.88.15","18tubehd.com","1fichier.com","1keydata.com","1madrasdub.*","1primewire.*","2017tube.com","2cf0xzdu.com","2fb9tsgn.fun","2madrasdub.*","398fitus.com","3gaytube.com","45.86.86.235","456movie.com","4archive.org","4bct9.live>>","4edtcixl.xyz","4fansites.de","4k2h4w04.xyz","4live.online","4movierulz.*","5moviess.com","720pstream.*","7hitmovies.*","8teenxxx.com","a6iqb4m8.xyz","ablefast.com","aboedman.com","absoluporn.*","abysscdn.com","acapellas.eu","adbypass.org","adcrypto.net","addonbiz.com","addtoany.com","adsurfle.com","adultfun.net","advnture.com","aegeanews.gr","afl3ua5u.xyz","afreesms.com","airflix1.com","airliners.de","akinator.com","akirabox.com","alcasthq.com","alexsports.*","aliancapes.*","allcalidad.*","alliptvs.com","allmusic.com","allosurf.net","alotporn.com","alphatron.tv","alrincon.com","alternet.org","amarillo.com","amateur8.com","amestrib.com","amnaymag.com","amtil.com.au","androidaba.*","anhdep24.com","anime-jl.net","anime3rb.com","animefire.io","animeflv.net","animefreak.*","animelok.xyz","animesanka.*","animeunity.*","animexin.vip","animixplay.*","aninami.site","aninavi.blog","anisubindo.*","anmup.com.np","annabelle.ch","anonmp4.help","antiadtape.*","antonimos.de","anybunny.com","apetube.asia","apkcombo.com","apkdrill.com","apkmodhub.in","apkprime.org","apkship.shop","apnablogs.in","apps2app.com","appsbull.com","appsmodz.com","aptisweb.com","aranzulla.it","arcaxbydz.id","arkadium.com","arolinks.com","aroratr.club","artforum.com","asiaflix.net","asianporn.li","askim-bg.com","atglinks.com","atgstudy.com","atozmath.com","audiotools.*","audizine.com","autoblog.com","autodime.com","autoembed.cc","autonews.com","autorevue.at","az-online.de","azores.co.il","b-hentai.com","babesexy.com","babiato.tech","babygaga.com","bagpipe.news","baithak.news","bandstand.ph","banned.video","baomidou.com","baramjak.com","barchart.com","baritoday.it","batchkun.com","batporno.com","bbyhaber.com","bceagles.com","bclikeqt.com","beemtube.com","beingtek.com","benchmark.pl","bestlist.top","bestwish.lol","biletomat.pl","bilibili.com","biopills.net","biovetro.net","birdurls.com","bitchute.com","bitssurf.com","bittools.net","blog-dnz.com","blogmado.com","blogmura.com","bloground.ro","blwideas.com","bobolike.com","bollydrive.*","bollyshare.*","boltbeat.com","bookfrom.net","bookriot.com","boredbat.com","boundhub.com","boysfood.com","br0wsers.com","braflix.tube","brainzaps.tv","brawlify.com","bright-b.com","brobokep.org","bronco6g.com","bsmaurya.com","bubraves.com","buffsports.*","buffstream.*","bugswave.com","bukaivip.com","bullfrag.com","burakgoc.com","burbuja.info","burnbutt.com","buyjiocoin.*","bysebuho.com","bysekoze.com","bysewihe.com","byswiizen.fr","calbears.com","callfuck.com","camaro7g.com","camhub.world","camlovers.tv","camporn.tube","camwhores.tv","camwhorez.tv","candylife.tw","capoplay.net","cardiagn.com","cariskuy.com","carnewz.site","cashbux.work","casperhd.com","casthill.net","cataz.stream","catcrave.com","catholic.com","cctvwiki.com","cdn.vifey.de","celebmix.com","celibook.com","cesoirtv.com","channel4.com","chatango.com","checktls.com","chibchat.com","chillizet.pl","chopchat.com","choralia.net","chzzkban.xyz","cinedetodo.*","cinemabg.net","cinemaxxl.de","cjonline.com","claimbits.io","claimtrx.com","clickapi.net","clicporn.com","clix4btc.com","clockskin.us","closermag.fr","cocogals.com","cocoporn.net","coderblog.in","codesnse.com","coindice.win","coingraph.us","coinsrev.com","collider.com","compsmag.com","compu-pc.com","cool-etv.net","cosmicapp.co","couchtuner.*","coursera.org","cracking.org","crazyblog.in","cricwatch.io","cryptowin.io","cuevana8.com","cuts-url.com","cwc.utah.gov","cyberdrop.me","cyberleaks.*","cyclones.com","cyprus.co.il","czechsex.net","da-imnetz.de","daddylive1.*","dafideff.com","dafontvn.com","daftporn.com","dailydot.com","dailysport.*","daizurin.com","daotekno.com","darkibox.com","datacheap.io","datanodes.to","datawav.club","dawntube.com","ddlvalley.me","deadline.com","deadspin.com","decanter.com","deckshop.pro","decorisi.com","deepbrid.com","deephot.link","delvein.tech","derwesten.de","descarga.xyz","desi.upn.bio","desihoes.com","desiupload.*","desivideos.*","deviants.com","digimanie.cz","dikgames.com","dir-tech.com","dirproxy.com","dirtyfox.net","dirtyporn.cc","dispatch.com","distanta.net","divicast.com","divxtotal1.*","djpunjab2.in","dl-protect.*","dlolcast.pro","dlupload.com","dndsearch.in","docsmall.com","dokumen.tips","domahatv.com","doodstream.*","dotabuff.com","doujindesu.*","downloadr.in","drakecomic.*","dreamdth.com","dredyson.com","drivefire.co","drivemoe.com","drivers.plus","dropbang.net","dropgalaxy.*","drsnysvet.cz","drublood.com","ds2video.com","dukeofed.org","dumovies.com","duolingo.com","dutchycorp.*","dvd-flix.com","dwlinks.buzz","eastream.net","ecamrips.com","eclypsia.com","edukaroo.com","egram.com.ng","egyanime.com","ehotpics.com","elcultura.pl","electsex.com","elvocero.com","embed4me.com","embedtv.best","emporda.info","endbasic.dev","eng-news.com","engvideo.net","epson.com.cn","eroclips.org","erofound.com","erogarga.com","eropaste.net","eroticmv.com","esportivos.*","estrenosgo.*","estudyme.com","et-invest.de","etonline.com","eurogamer.de","eurogamer.es","eurogamer.it","eurogamer.pt","euronews.com","eurostream.*","evernia.site","evfancy.link","ex-foary.com","examword.com","exe-urls.com","expertvn.com","eymockup.com","ezeviral.com","f1livegp.net","facebook.com","factable.com","fairyhorn.cc","faiviral.com","fansided.com","fansmega.com","fapality.com","fapfappy.com","fastilinks.*","fat-bike.com","fbsquadx.com","fc2stream.tv","fedscoop.com","feed2all.org","fehmarn24.de","femdomtb.com","ferdroid.net","fileguard.cc","fileguru.net","filemoon.*>>","filerice.com","filescdn.com","filessrc.com","filezipa.com","filmifen.com","filmisongs.*","filmizip.com","filmizletv.*","filmy4wap1.*","filmygod13.*","filmyone.com","filmyzilla.*","financid.com","finevids.xxx","firestream.*","firstonetv.*","fitforfun.de","fivemdev.org","flaticon.com","flexy.stream","flexyhit.com","flightsim.to","flixbaba.com","flowsnet.com","flstv.online","flvto.com.co","fm-arena.com","fmoonembed.*","focus4ca.com","footybite.to","forexrw7.com","forogore.com","forplayx.ink","fotopixel.es","freedidi.com","freejav.guru","freemovies.*","freemp3.tube","freeshib.biz","freetron.top","freewsad.com","fremdwort.de","freshbbw.com","fsileaks.com","fuckmilf.net","fullboys.com","fullcinema.*","fullhd4k.com","fuskator.com","futemais.net","fxpornhd.com","galaxyos.net","game-owl.com","gamebrew.org","gamefast.org","gamekult.com","gamer.com.tw","gamerant.com","gamersky.com","gamerxyt.com","games.get.tv","games.wkb.jp","gameslay.net","gameszap.com","gametter.com","gamezizo.com","gamingsym.in","gatagata.net","gay4porn.com","gaystream.pw","gayteam.club","gculopes.com","gekkonen.net","gelbooru.com","gentside.com","getitfree.cn","getmodsapk.*","gifcandy.net","gioialive.it","gksansar.com","glo-n.online","globes.co.il","globfone.com","gniewkowo.eu","gnusocial.jp","go2share.net","goanimes.vip","gobadgers.ca","gocast123.me","godzcast.com","gogoanimes.*","gogriffs.com","golancers.ca","gomuraw.blog","gonzoporn.cc","goodav17.com","goracers.com","gosexpod.com","gottanut.com","goxavier.com","gplastra.com","grazymag.com","greekfun.net","grigtube.com","grosnews.com","gseagles.com","gsmarena.com","gsmhamza.com","guidetnt.com","gurusiana.id","h-game18.xyz","habuteru.com","hachiraw.net","hackshort.me","hackstore.me","halloporno.*","hanime24.com","harbigol.com","hbnews24.com","hbrfrance.fr","hdfcfund.com","hdhub4u.fail","hdmoviehub.*","hdmovies23.*","hdmovies4u.*","hdmovies50.*","hdpopcorns.*","hdporn92.com","hdpornos.net","hdvideo9.com","hellmoms.com","helpdice.com","hentai2w.com","hentai4k.com","hentaicube.*","hentaigo.com","hentaila.com","hentaimoe.me","hentais.tube","hentaitk.net","hentaizm.fun","heqviral.com","hi0ti780.fun","highporn.net","hiperdex.com","hipsonyc.com","hirotron.com","hispajav.com","hivetoon.com","hktvmall.com","hmanga.world","hometalk.com","hostmath.com","hotmilfs.pro","hqporner.com","hubdrive.com","huffpost.com","hurawatch.cc","hwzone.co.il","hyderone.com","hydrogen.lat","hypnohub.net","ibradome.com","icutlink.com","icyporno.com","idealight.it","idesign.wiki","idntheme.com","iguarras.com","ihdstreams.*","ilovephd.com","ilpescara.it","imagefap.com","imdpu9eq.com","imgadult.com","imgbaron.com","imgblaze.net","imgbnwe.shop","imgbyrev.sbs","imgclick.net","imgdrive.net","imgflare.com","imgfrost.net","imggune.shop","imgjajhe.sbs","imgmffmv.sbs","imgnbii.shop","imgolemn.sbs","imgprime.com","imgqbbds.sbs","imgspark.com","imgthbm.shop","imgtorrnt.in","imgxabm.shop","imgxxbdf.sbs","imintweb.com","indian-tv.cz","indianxxx.us","indystar.com","infodani.net","infofuge.com","informer.com","instamod.app","interssh.com","intro-hd.net","ipacrack.com","ipatriot.com","iptvapps.net","iptvspor.com","iputitas.net","iqksisgw.xyz","isaidub6.net","itainews.com","itz-fast.com","iwanttfc.com","izzylaif.com","jaktsidan.se","jalopnik.com","japanporn.tv","japteenx.com","jav-asia.top","javboys.tv>>","javbraze.com","javguard.xyz","javhahaha.us","javhdz.today","javindo.site","javjavhd.com","javmelon.com","javplaya.com","javplayer.cc","javplayer.me","javprime.net","javquick.com","javrave.club","javtiful.com","javturbo.xyz","jconline.com","jenpornuj.cz","jeshoots.com","jmzkzesy.xyz","jobfound.org","jobsheel.com","jockantv.com","joymaxtr.net","jsfiddle.net","jsonline.com","juba-get.com","jujmanga.com","kabeleins.de","kafeteria.pl","kakitengah.*","kamehaus.net","kaoskrew.org","karanapk.com","katmoviehd.*","kattracker.*","kaystls.site","khaddavi.net","khatrimaza.*","khsn1230.com","kickasskat.*","kinisuru.com","kinkyporn.cc","kino-zeit.de","kiss-anime.*","kisstvshow.*","klubsports.*","knowstuff.in","knoxnews.com","kolcars.shop","kollhong.com","konten.co.id","koramaup.com","kpopjams.com","kr18plus.com","kreisbote.de","kstreaming.*","kubo-san.com","kumapoi.info","kungfutv.net","kunmanga.com","kurazone.net","kusonime.com","ladepeche.fr","landwirt.com","lanjutkeun.*","leaktube.net","learnmany.in","lectormh.com","lecturel.com","leechall.com","leprogres.fr","lesbenhd.com","lesbian8.com","lewdzone.com","liddread.com","lifestyle.bg","likemanga.io","likuoo.video","lineup11.net","linfoweb.com","linkjust.com","linksaya.com","linkshorts.*","linkvoom.com","lionsfan.net","livegore.com","livemint.com","livesport.ws","ln-online.de","lokerwfh.net","longporn.xyz","lootdest.com","lover937.net","lrepacks.net","lucidcam.com","lulustream.*","luluvdoo.com","luluvido.com","luluvids.top","luscious.net","lusthero.com","luxuretv.com","m-hentai.net","m.nivod2.com","m.nivod4.com","mac2sell.net","macsite.info","mamahawa.com","manga18.club","mangadna.com","mangafire.to","mangagun.net","mangakita.id","mangakoma.ac","mangalek.com","mangamanga.*","manganato.gg","manganelo.tv","mangarawjp.*","mangaruu.com","mangasco.com","mangoporn.co","mangovideo.*","manhuaga.com","manhuascan.*","manhwa68.com","manhwass.com","manhwaus.net","manpeace.org","manyakan.com","manytoon.com","maqal360.com","marmiton.org","masahub2.com","masengwa.com","mashtips.com","masslive.com","mat6tube.com","mathaeser.de","maturell.com","mavanimes.co","maxgaming.fi","mazakony.com","mc-hacks.net","mcfucker.com","mcrypto.club","mdbekjwqa.pw","mdtaiwan.com","mealcold.com","medscape.com","medytour.com","meetimgz.com","mega-mkv.com","mega-p2p.net","megatube.xxx","megaupto.com","meilblog.com","meloradio.pl","metabomb.net","meteolive.it","miaandme.org","micmicidol.*","microify.com","midis.com.ar","miixdrop.net","milftoon.xxx","mirror.co.uk","missavtv.com","missyusa.com","mitsmits.com","mixloads.com","mjukb26l.fun","mkvcinemas.*","mlbstream.tv","mmsbee27.com","mmsbee47.com","mobitool.net","modcombo.com","moddroid.com","modhoster.de","modsbase.com","modsfire.com","modyster.com","mom4real.com","momo-net.com","momon-ga.com","momspost.com","momxxx.video","monaco.co.il","moretvtime.*","moshahda.net","motofakty.pl","movie4u.live","moviedokan.*","movieffm.net","moviefreak.*","moviekids.tv","movielair.cc","movierulzs.*","movierulzz.*","movies123.pk","movies18.net","movies4us.co","moviesapi.to","moviesbaba.*","moviesflix.*","moviesland.*","moviespapa.*","moviesrulz.*","moviesshub.*","moviesxxx.cc","movieweb.com","movstube.net","mp3fiber.com","mp3juices.su","mp4-porn.net","mpg.football","mrscript.net","multporn.net","musictip.net","mutigers.com","myesports.gg","myflixerz.to","myfxbook.com","mylinkat.com","naniplay.com","nanolinks.in","napiszar.com","nar.k-ba.net","natgeotv.com","nbastream.tv","nemumemo.com","nephobox.com","netmovies.to","netoff.co.jp","netuplayer.*","newatlas.com","news.now.com","newsammo.com","newsextv.com","newslive.com","newsmondo.it","nextdoor.com","nextorrent.*","neymartv.net","nflscoop.xyz","nflstream.tv","nicetube.one","nicknight.de","nicovideo.jp","nifteam.info","niganpro.com","nilesoft.org","niu-pack.com","niyaniya.moe","njherald.com","nkunorse.com","nonktube.com","nosubapp.com","novelasesp.*","novelbob.com","novelread.co","novoglam.com","novoporn.com","nowmaxtv.com","nowsports.me","nowsportv.nl","nowtv.com.tr","nptsr.live>>","nsfwgify.com","nsfwzone.xyz","nudecams.xxx","nudedxxx.com","nudistic.com","nudogram.com","nudostar.com","nueagles.com","nugglove.com","nusports.com","nwzonline.de","nyaa.iss.ink","nzbstars.com","oaaxpgp3.xyz","of-model.com","ohmanhua.com","oilprice.com","oimsmosy.fun","oklivetv.com","okulsoru.com","oldcamera.pl","olutposti.fi","olympics.com","oncehelp.com","ondebola.com","oneupload.to","onlinexxx.cc","onlytech.com","onscreens.me","onyxfeed.com","op-online.de","openload.mov","opinie.wp.pl","opomanga.com","optifine.net","orangeink.pk","osuskins.net","otakukan.com","otakuraw.net","ottverse.com","ottxmaza.com","ovagames.com","ovnihoje.com","oyungibi.com","pagalworld.*","pak-mcqs.net","paktech2.com","pal-item.com","pandadoc.com","pandamovie.*","pansearch.me","papunika.com","parenting.pl","parzibyte.me","paste.bin.sx","pastepvp.org","pastetot.com","pay4fans.com","pc-hobby.com","pdfindir.net","peachify.top","peekvids.com","pelimeli.com","pelis182.net","pelisflix2.*","pelishouse.*","pelispedia.*","pelisplus2.*","pennlive.com","pentest.blog","pentruea.com","perisxxx.com","petguide.com","phimando.com","phimmoiaz.cc","photooxy.com","photopea.com","picbaron.com","picjbet.shop","picnwqez.sbs","picyield.com","pietsmiet.de","pig-fuck.com","pilibook.com","pinayflix.me","piratebayz.*","pisatoday.it","pittband.com","pixbnab.shop","pixdfdj.shop","piximfix.com","pixkfkf.shop","pixnbrqw.sbs","pixrqqz.shop","pkw-forum.de","platinmods.*","play.1188.lv","play.max.com","play.nova.bg","play1002.com","player4u.xyz","playerfs.com","playfront.de","playmogo.com","playstore.pw","playvids.com","plaza.chu.jp","plc4free.com","plusupload.*","pmvhaven.com","pogoda.wp.pl","poki-gdn.com","politico.com","polygamia.pl","pomofocus.io","ponsel4g.com","porn4fans.me","pornabcd.com","pornachi.com","pornbest.org","porncomics.*","pornditt.com","pornfeel.com","pornfeet.xyz","pornflip.com","porngames.tv","porngrey.com","pornhat.asia","pornhdin.com","pornhits.com","pornhost.com","pornicom.com","pornleaks.in","pornlift.com","pornlore.com","pornluck.com","pornmoms.org","porno-tour.*","pornoaid.com","pornobae.com","pornoente.tv","pornohd.blue","pornotom.com","pornozot.com","pornpapa.com","porntape.net","porntrex.com","pornvibe.org","pornwatch.ws","pornyeah.com","pornyfap.com","pornzone.com","poscitechs.*","postazap.com","postimees.ee","powcloud.org","prensa.click","pressian.com","pricemint.in","prime4you.de","produsat.com","programme.tv","promipool.de","proplanta.de","prothots.com","proxyorb.com","ps2-bios.com","pugliain.net","pupupul.site","pussyspace.*","putlocker9.*","putlockerc.*","putlockers.*","pysznosci.pl","q1-tdsge.com","qashbits.com","qpython.club","quizrent.com","qvzidojm.com","r3owners.net","raidrush.net","rail-log.net","rajtamil.org","ranger5g.com","ranger6g.com","ranjeet.best","rapelust.com","rarepike.com","raulmalea.ro","rawmanga.top","rawstory.com","razzball.com","rbs.ta36.com","recipahi.com","recipenp.com","recording.de","reddflix.com","redecanais.*","redretti.com","remilf.xyz>>","rennlist.com","repelisgoo.*","repretel.com","reqlinks.net","resplace.com","retire49.com","richhioon.eu","riotbits.com","ritzysex.com","rockmods.net","rolltide.com","romatoday.it","rome2rio.com","roms-hub.com","ronaldo7.pro","root-top.com","rosasidan.ws","rosefile.net","rot-blau.com","royalkom.com","rp-online.de","rtilinks.com","rubias19.com","rue89lyon.fr","ruidrive.com","rushporn.xxx","s10forum.com","s2watch.link","saablink.net","salidzini.lv","samfirms.com","samovies.net","satkurier.pl","savefrom.net","savegame.pro","savesubs.com","savevideo.me","scamalot.com","scjhg5oh.fun","seeklogo.com","seireshd.com","seksrura.net","senimovie.co","senmanga.com","senzuri.tube","servustv.com","sethphat.com","seuseriado.*","sex-pic.info","sexgames.xxx","sexgay18.com","sexroute.net","sexy-games.*","sexyhive.com","sfajacks.com","sgxnifty.org","shanurdu.com","sharedrive.*","sharetext.me","shemale6.com","shemedia.com","sheshaft.com","shorteet.com","shrtslug.biz","sieradmu.com","silkengirl.*","sinonimos.de","siteflix.org","sitekeys.net","skinnyhq.com","skinnyms.com","slawoslaw.pl","slkworld.com","slreamplay.*","slutdump.com","slutmesh.net","smailpro.com","smallpdf.com","smcgaels.com","smgplaza.com","snlookup.com","sobatkeren.*","sodomojo.com","solarmovie.*","sonixgvn.net","sortporn.com","sound-park.*","southfreak.*","sp-today.com","sp500-up.com","speedrun.com","spielfilm.de","spinoff.link","sport-97.com","sportico.com","sporting77.*","sportlemon.*","sportlife.es","sportnews.to","sportshub.to","sportskart.*","ssforums.com","starcima.com","stardeos.com","stardima.com","stayglam.com","stbturbo.xyz","stevivor.com","stimotion.pl","stre4mplay.*","stream18.net","streamango.*","streambee.to","streameast.*","streamhls.to","streampiay.*","streamtape.*","streamwish.*","strikeout.im","striphub.cam","subtaboo.com","sunbtc.space","sunporno.com","superapk.org","superpsx.com","supervideo.*","supjav.com>>","supramkv.com","surfline.com","surrit.store","sushi-scan.*","sussytoons.*","suzihaza.com","suzylu.co.uk","svipvids.com","swiftload.io","synonyms.com","syracuse.com","system32.ink","tabering.net","tabooporn.tv","tacobell.com","tacoma4g.com","tagecoin.com","tajpoint.com","tamilprint.*","tamilyogis.*","tampabay.com","tanfacil.net","tapchipi.com","tapepops.com","tatabrada.tv","team-rcv.xyz","tech24us.com","tech4auto.in","techably.com","techmuzz.com","technons.com","technorj.com","techstage.de","techstwo.com","techtobo.com","techyinfo.in","techzed.info","teencamx.com","teenhost.net","teensark.com","teensporn.tv","teknorizen.*","telecinco.es","telegraaf.nl","telegram.com","teleriumtv.*","teluguflix.*","teraearn.com","terashare.co","terashare.me","tesbox.my.id","tespedia.com","testious.com","th-world.com","theblank.net","thecomet.net","theconomy.me","thedaddy.*>>","thefmovies.*","thegamer.com","theherta.com","thehindu.com","thekickass.*","thelinkbox.*","themezon.net","theonion.com","theproxy.app","thertstv.com","thesleak.com","thesukan.net","thesun.co.uk","thevalley.fm","theverge.com","threezly.com","thuglink.com","thurrott.com","tieulam.info","tigernet.com","tik-tok.porn","timestamp.fr","tioanime.com","tipranks.com","tnaflix.asia","tnhitsda.net","tntdrama.com","tokuzl.net>>","topeuropix.*","topfaucet.us","topkickass.*","topspeed.com","topstreams.*","torture1.net","trahodom.com","traingon.top","trendyol.com","trustnet.com","truthnews.de","truyenvn.dev","tryboobs.com","ts-mpegs.com","tsmovies.com","tubedupe.com","tubewolf.com","tubxporn.com","tucinehd.com","turbobit.net","turbovid.vip","turkdown.com","turkrock.com","tusfiles.com","tvappapk.com","tvdigital.de","tvnow247.top","tvpclive.com","tvtropes.org","tweakers.net","twister.porn","tz7z9z0h.com","u-s-news.com","u26bekrb.fun","udoyoshi.com","ugreen.autos","uhdwalls.com","ukchat.co.uk","ukdevilz.com","ukigmoch.com","ultraten.net","umagame.info","unitystr.com","up-4ever.net","upload18.com","uploadbox.io","uploadmx.com","uploads.mobi","uploadvr.com","upshrink.com","uptomega.net","ur-files.com","usatoday.com","usaxtube.com","userupload.*","usp-forum.de","utahutes.com","utaitebu.com","utakmice.net","utsports.com","uur-tech.net","uwatchfree.*","veganinja.hu","vegas411.com","vibehubs.com","videofilms.*","videojav.com","videos-xxx.*","videovak.com","vidnest.live","vidsaver.net","vidsonic.net","vidsrc.click","viidshar.com","vijviral.com","vikiporn.com","violablu.net","vipporns.com","viralxns.com","visorsmr.com","vivasexe.com","vocalley.com","voirseries.*","volokit2.com","voznovel.com","vr.pornhat.*","walftech.com","warddogs.com","warezcdn.lat","watchmovie.*","watchmygf.me","watchop.live","watchporn.cc","watchporn.to","watchtvchh.*","way2movies.*","web2.0calc.*","webcams.casa","webnovel.com","webxmaza.com","westword.com","whatgame.xyz","whathifi.com","whyvpn.my.id","wikifeet.com","wikirise.com","wikisport.cc","wildsnow.com","winboard.org","winfuture.de","winlator.com","wishfast.top","withukor.com","wohngeld.org","wolfstream.*","worldaide.fr","worldsex.com","writedroid.*","wspinanie.pl","www.google.*","wxredian.com","wyborcza.biz","x-video.tube","xbeibeix.com","xemphim1.top","xfantazy.com","xfantazy.org","xhaccess.com","xhadult2.com","xhadult3.com","xhamster.com","xhamster10.*","xhamster11.*","xhamster12.*","xhamster13.*","xhamster14.*","xhamster15.*","xhamster16.*","xhamster17.*","xhamster18.*","xhamster19.*","xhamster20.*","xhamster42.*","xhamster46.*","xhdate.world","xiebruce.top","xpornium.net","xsexpics.com","xteensex.net","xvideos.name","xvideos2.com","xxporner.com","xxxfiles.com","xxxhdvideo.*","xxxonline.cc","xxxpicss.com","xxxputas.net","xxxshake.com","xxxstream.me","yabiladi.com","yaoiscan.com","yggtorrent.*","yhocdata.com","ynk-blog.com","yogranny.com","you-porn.com","yourlust.com","yts-subs.com","yts-subs.net","ytube2dl.com","yuatools.com","yurudori.com","yuvideos.com","zealtyro.com","zehnporn.com","zenradio.com","zhlednito.cz","zilla-xr.xyz","zimabdko.com","zone.msn.com","zootube1.com","zplayer.live","zpserver.com","zvision.link","zxcprime.icu","01234movies.*","01fmovies.com","10convert.com","10play.com.au","10starhub.com","111.90.150.10","111.90.151.26","111movies.com","123gostream.*","123movies.net","123moviesgo.*","123movieshd.*","123moviesla.*","123moviesme.*","123movieweb.*","123multihub.*","185.53.88.104","185.53.88.204","190.115.18.20","1bitspace.com","1qwebplay.xyz","1xxx-tube.com","247sports.com","2girls1cup.ca","30kaiteki.com","360news4u.net","38.242.194.12","3dhentai.club","4download.net","4drumkits.com","4filmyzilla.*","4horlover.com","4meplayer.com","4movierulz1.*","4runner6g.com","560pmovie.com","5movierulz2.*","6hiidude.gold","7fractals.icu","7misr4day.com","7movierulz1.*","7moviesrulz.*","7vibelife.com","94.103.83.138","9ketsuki.info","abczdrowie.pl","abendblatt.de","abseits-ka.de","acusports.com","acutetube.net","adblocktape.*","advantien.com","advertape.net","aha-music.com","ainonline.com","aitohuman.org","ajt.xooit.org","akcartoons.in","albania.co.il","alexbacher.fr","aliexpress.ru","aliexpress.us","alimaniac.com","allitebooks.*","allmomsex.com","alltstube.com","allusione.org","alohatube.xyz","alueviesti.fi","ambonkita.com","angelfire.com","angelgals.com","anihdplay.com","animecast.net","animefever.cc","animeflix.ltd","animefreak.to","animeheaven.*","animenexus.in","animesite.net","animesup.info","animetoast.cc","animeunity.so","animeworld.ac","animeworld.tv","animeyabu.net","animeyabu.org","animeyubi.com","anitube22.vip","aniwatchtv.to","aniworld.to>>","anonyviet.com","anusling.info","aogen-net.com","aparttent.com","appteka.store","archive.today","archivebate.*","archpaper.com","areabokep.com","areamobile.de","areascans.net","areatopik.com","arenascan.com","arenavision.*","arhplyrics.in","ariestube.com","ark-unity.com","arldeemix.com","artesacro.org","arti-flora.nl","articletz.com","artribune.com","asianhdplay.*","asianlbfm.net","asiansex.life","asiaontop.com","askattest.com","asssex-hd.com","astroages.com","astronews.com","at.wetter.com","audiotag.info","audiotrip.org","austiblox.net","auto-data.net","auto-swiat.pl","autobytel.com","autoembed.app","autoextrem.de","autoguide.com","autoscout24.*","autosport.com","autotrader.nl","autotrader.pl","avnetwork.com","avnsgames.com","avpgalaxy.net","axu.pages.dev","axutongxue.cn","azcentral.com","b-bmovies.com","babakfilm.com","babepedia.com","babestube.com","babytorrent.*","baddiehub.com","beasttips.com","beegsexxx.com","besargaji.com","bestgames.com","beverfood.com","biftutech.com","bikeradar.com","bikerszene.de","bikerumor.com","bilasport.net","bilinovel.com","billboard.com","bimshares.com","bingsport.xyz","biquge321.com","biquge543.com","bitcosite.com","bitfaucet.net","bitlikutu.com","bitview.cloud","bizdustry.com","blasensex.com","blog.40ch.net","blogesque.net","blograffo.net","blurayufr.cam","bobs-tube.com","bokugents.com","bolly2tolly.*","bollymovies.*","boobgirlz.com","bootyexpo.net","boxylucha.com","boystube.link","bravedown.com","bravoporn.com","brawlhalla.fr","breitbart.com","breznikar.com","brighteon.com","brocoflix.com","brocoflix.xyz","bshifast.live","buffsports.io","buffstreams.*","bustyfats.com","buydekhke.com","bymichiby.com","call4cloud.nl","camarchive.tv","camdigest.com","camgoddess.tv","camvideos.org","camwhorestv.*","camwhoria.com","canlikolik.my","cantonrep.com","capo5play.com","capo6play.com","caravaning.de","cardshare.biz","carryflix.com","carryflix.icu","carscoops.com","cat-a-cat.net","cat3movie.org","ccthesims.com","cdiscount.com","celeb.gate.cc","celemusic.com","ceramic.or.kr","ceylonssh.com","cg-method.com","cgcosplay.org","chapteria.com","chataigpt.org","cheatcloud.cc","cheater.ninja","cheatsquad.gg","chevalmag.com","chieftain.com","chihouban.com","chikonori.com","chimicamo.org","chloeting.com","cima100fm.com","cinecalidad.*","cinefreak.net","cinemabaz.com","civitai.green","claimbits.net","claudelog.com","claydscap.com","clickhole.com","cloudvideo.tv","cloudwish.xyz","cmsdetect.com","cmtracker.net","cnnamador.com","cockmeter.com","cocomanga.com","code2care.org","codeastro.com","codesnail.com","codewebit.top","coinbaby8.com","coinfaucet.io","coinlyhub.com","coinsbomb.com","colamanga.com","comedyshow.to","comexlive.org","computer76.ru","condorsoft.co","configspc.com","cooksinfo.com","coolcast2.com","coolporno.net","corrector.app","cotemaison.fr","crackcodes.in","crackevil.com","crackfree.org","crazyporn.xxx","crazyshit.com","crazytoys.xyz","cricket12.com","crimsonav.com","criollasx.com","criticker.com","crocotube.com","crotpedia.net","crypto4yu.com","cryptonor.xyz","cryptorank.io","cuisineaz.com","cumlouder.com","cuttlinks.com","cybermania.ws","cyklobazar.cz","czterykaty.pl","daddylive.*>>","daddylivehd.*","dailymail.com","dailynews.com","dailyrevs.com","dandanzan.top","dankmemer.lol","datavaults.co","dbusports.com","dcleakers.com","ddd-smart.net","decmelfot.xyz","deichstube.de","deluxtube.com","demae-can.com","dengarden.com","denofgeek.com","depvailon.com","derusblog.com","descargasok.*","desertsun.com","desicinema.se","desifakes.com","desijugar.net","desimmshd.com","devsoftwr.com","dfilmizle.com","dic.pixiv.net","dickclark.com","dinnerexa.com","dipprofit.com","dirtyship.com","diskizone.com","dl-protect1.*","dlapk4all.com","dldokan.store","dlhe-videa.sk","dlstreams.*>>","doctoraux.com","dongknows.com","donkparty.com","doofree88.com","doomovie-hd.*","dooodster.com","doramasyt.com","dorawatch.net","douxporno.com","downloader.is","downloadhub.*","dr-farfar.com","dragontea.ink","dramafren.com","dramafren.org","dramavideo.se","dramaviki.com","drivelinks.me","drivenime.com","driveup.space","drop.download","dropnudes.com","dropshipin.id","dubaitime.net","durtypass.com","e-monsite.com","eatsmarter.de","ebonybird.com","ebook-hell.to","ebook3000.com","ebooksite.org","edealinfo.com","edukamer.info","elespanol.com","embdproxy.xyz","embed.scdn.to","embedgram.com","embedplayer.*","embedrise.com","embedseek.xyz","embedwish.com","empleo.com.uy","emueagles.com","encurtads.net","encurtalink.*","enjoyfuck.com","ensenchat.com","entenpost.com","entireweb.com","ephoto360.com","epochtimes.de","eporner.video","eramuslim.com","erospots.info","eroticity.net","erreguete.gal","eurogamer.net","ev3forums.com","exe-links.com","expansion.com","extratipp.com","f150gen14.com","familyporn.tv","fanfiktion.de","fangraphs.com","fantasiku.com","fapomania.com","faresgame.com","farodevigo.es","fastcars1.com","fclecteur.com","fembed9hd.com","fetish-tv.com","fetishtube.cc","file-upload.*","filehorse.com","filemooon.top","filmeseries.*","filmibeat.com","filmlinks4u.*","filmy4wap.uno","filmyporno.tv","filmyworlds.*","finanse.wp.pl","findheman.com","firescans.xyz","firestream.to","firmwarex.net","firstpost.com","fitness.wp.pl","fivemturk.com","flexamens.com","flexxporn.com","flix-wave.lol","flixlatam.com","flyplayer.xyz","fmoviesfree.*","fontyukle.net","footeuses.com","footyload.com","forexforum.co","forlitoday.it","forum.dji.com","fosslinux.com","fotoblogia.pl","foxaholic.com","foxsports.com","foxtel.com.au","frauporno.com","free.7hd.club","freedom3d.art","freeflix.info","freegames.com","freeiphone.fr","freejavbt.com","freeomovie.to","freeporn8.com","freesex-1.com","freeshot.live","freexcafe.com","freexmovs.com","freshscat.com","freyalist.com","fromwatch.com","fsicomics.com","fsl-stream.lu","fsportshd.net","ftchinese.com","fuck-beeg.com","fuck-xnxx.com","fuckingfast.*","fucksporn.com","fullassia.com","fullhdxxx.com","funandnews.de","fussball.news","futurezone.de","fzmovies.info","fztvseries.ng","galesburg.com","gamearter.com","gamefront.com","gamelopte.com","gamereactor.*","games.bnd.com","games.qns.com","gamesider.com","gamesite.info","gamesmain.xyz","gamezhero.com","gamovideo.com","garoetpos.com","gatasdatv.com","gayboyshd.com","gaysearch.com","geekering.com","generate.plus","gesundheit.de","getintopc.com","getpaste.link","getpczone.com","gfsvideos.com","ghscanner.com","gigmature.com","gipfelbuch.ch","girlnude.link","girlydrop.com","gkstreams.*>>","globalnews.ca","globalrph.com","globalssh.net","globlenews.in","go.linkify.ru","gobobcats.com","gogoanimetv.*","gogoplay1.com","gogoplay2.com","gohuskies.com","gol245.online","goldderby.com","gomaainfo.com","gomoviestv.to","goodriviu.com","goupstate.com","govandals.com","grabpussy.com","grantorrent.*","graphicux.com","greatnass.com","greensmut.com","gry-online.pl","gsmturkey.net","guardaserie.*","guessthe.game","gutefrage.net","gutekueche.at","gwiazdy.wp.pl","gwusports.com","haaretz.co.il","hailstate.com","hairytwat.org","hamhigh.co.uk","hancinema.net","haonguyen.top","haoweichi.com","harimanga.com","harzkurier.de","hb-nippon.com","hdgayporn.net","hdmoviefair.*","hdmoviehubs.*","hdmovieplus.*","hdmovies2.org","hdtubesex.net","heatworld.com","heimporno.com","hellabyte.one","hellenism.net","hellporno.com","hentai-ia.com","hentaicomic.*","hentaicop.com","hentaihaven.*","hentaikai.com","hentaimama.tv","hentaipaw.com","hentaiporn.me","hentairead.io","hentaiyes.com","hertsad.co.uk","herzporno.net","heutewelt.com","hexupload.net","hiddenleaf.to","hifi-forum.de","hihihaha1.xyz","hihihaha2.xyz","hikvision.com","hilites.today","hillsdale.net","hindimovies.*","hindinest.com","hindishri.com","hindisink.com","hindisite.net","hispasexy.org","hitsports.pro","hlsplayer.top","hobbykafe.com","hogtiehub.com","holaporno.xxx","holymanga.net","hornbunny.com","hornyfanz.com","hosttbuzz.com","hostzteam.com","hotntubes.com","hotpress.info","howtogeek.com","hqmaxporn.com","hqpornero.com","hqsex-xxx.com","htmlgames.com","hulkshare.com","hurawatchz.to","hutchnews.com","hydraxcdn.biz","hypebeast.com","hyperdebrid.*","iammagnus.com","iceland.co.uk","ichberlin.com","icy-veins.com","ievaphone.com","iflixmovies.*","ifreefuck.com","igg-games.com","ignboards.com","iiyoutube.com","ikarianews.gr","ikz-online.de","ilpiacenza.it","imagehaha.com","imagenpic.com","imgbbnhi.shop","imgbncvnv.sbs","imgcredit.xyz","imghqqbg.shop","imgkkabm.shop","imgmyqbm.shop","imgouskel.sbs","imgwallet.com","imgwwqbm.shop","imleagues.com","indiafree.net","indianyug.com","indiewire.com","ineedskin.com","inextmovies.*","infidrive.net","inhabitat.com","instagram.com","instalker.org","interfans.org","investing.com","iogames.space","ipalibrary.me","iptvpulse.top","italpress.com","itdmusics.com","itdmusicy.com","itmaniatv.com","itopmusic.com","itsguider.com","jadijuara.com","jagoanssh.com","jameeltips.us","japanxxx.asia","jav-forum.com","jav101.online","javenglish.cc","javguard.club","javhdporn.com","javhdporn.net","javleaked.com","javmobile.net","javplayer.com","javporn18.com","javsaga.ninja","javstream.com","javstream.top","javsubbed.xyz","javsunday.com","jaysndees.com","jazzradio.com","jellynote.com","jennylist.xyz","jesseporn.xyz","jiocinema.com","jipinsoft.com","jizzberry.com","jk-market.com","jkdamours.com","jlaforums.com","jncojeans.com","jobzhub.store","joongdo.co.kr","jpscan-vf.com","jptorrent.org","juegos.as.com","jumboporn.xyz","jurukunci.net","justjared.com","justwatch.com","juventusfc.hu","k12reader.com","kacengeng.com","kakiagune.com","kalileaks.com","kanald.com.tr","kangkimin.com","katdrive.link","katestube.com","katmoviefix.*","kayoanime.com","kckingdom.com","kenta2222.com","kfapfakes.com","kfrfansub.com","kicaunews.com","kickcharm.com","kiplinger.com","kissasian.*>>","kitsapsun.com","klaustube.com","klikmanga.com","kllproject.lv","klmanga.cloud","klykradio.com","kobieta.wp.pl","komunikaty.pl","koreanbj.club","korsrt.eu.org","kotanopan.com","kpopjjang.com","ksiazki.wp.pl","ksusports.com","kuchnia.wp.pl","kumascans.com","kupiiline.com","kuronavi.blog","kurosuen.live","lamorgues.com","laptopmag.com","laptrinhx.com","latinabbw.xyz","latinlucha.es","laurasia.info","lavoixdux.com","law101.org.za","learn-cpp.org","learnclax.com","lecceprima.it","leccotoday.it","leermanga.net","leinetal24.de","letmejerk.com","letras.mus.br","lewdstars.com","liberation.fr","liiivideo.com","likemanga.ink","lilymanga.net","ling-online.*","link4rev.site","linkfinal.com","linkshortx.in","linkskibe.com","linkspaid.com","linovelib.com","linuxhint.com","lippycorn.com","listeamed.net","litecoin.host","litonmods.com","liveonsat.com","livestreams.*","liveuamap.com","livingetc.com","loanbixby.com","lolcalhost.ru","lolhentai.net","longfiles.com","lookmovie2.to","loot-link.com","loptelink.com","lordpremium.*","love4porn.com","lovetofu.cyou","lowellsun.com","lrtrojans.com","lsusports.net","ludigames.com","lulacloud.com","lustesthd.lat","lustholic.com","lusttaboo.com","lustteens.net","lustylist.com","lustyspot.com","m.1024txt.com","m.viptube.com","m.youtube.com","maccanismi.it","macromicro.me","macrumors.com","macserial.com","madamnazar.io","magesypro.com","mailnesia.com","mailocal2.xyz","mainbabes.com","mainlinks.xyz","mainporno.com","makeuseof.com","mamochki.info","manga-tube.me","manga18fx.com","mangaball.com","mangabats.com","mangacrab.com","mangacrab.org","mangadass.com","mangafreak.me","mangahere.onl","mangakoma01.*","mangalist.org","mangarawjp.me","mangaread.org","mangasite.org","mangoporn.net","manhastro.com","manhastro.net","manhuatop.org","manhwatop.com","manofadan.com","map.naver.com","math-aids.com","mathcrave.com","mathebibel.de","mathsspot.com","matomeiru.com","maxegatos.net","maz-online.de","mconverter.eu","md3b0j6hj.com","mdfx9dc8n.net","mdy48tn97.com","medebooks.xyz","mediafire.com","mediamarkt.be","mediamarkt.de","mediapason.it","medihelp.life","mega-dvdrip.*","megagames.com","megane.com.pl","megawarez.org","megawypas.com","meineorte.com","meinestadt.de","memedroid.com","menshealth.de","metalflirt.de","meteocity.com","meteopool.org","metrolagu.cam","mettablog.com","meuanime.info","mexicogob.com","mh.baxoi.buzz","mhdsportstv.*","mhdtvsports.*","miiixdrop.net","milfnut.com>>","minhatela.xyz","miohentai.com","mirrorace.com","missav123.com","missav888.com","mitedrive.com","mixdrop21.net","mixdrop23.net","mixdropjmk.pw","mjakmama24.pl","mmastreams.me","mmorpg.org.pl","mobdi3ips.com","mobdropro.com","modelisme.com","mom-pussy.com","momxxxass.com","momxxxsex.com","moneyhouse.ch","moneyweek.com","monstream.org","monzatoday.it","moonquill.com","moovitapp.com","moozpussy.com","moregirls.org","morencius.com","morgenpost.de","mosttechs.com","motive213.com","motofan-r.com","motor-talk.de","motorbasar.de","motortests.de","moutogami.com","moviedekho.in","moviefone.com","moviehaxx.pro","moviejones.de","movielinkbd.*","moviepilot.de","movieping.com","movierulzhd.*","moviesdaweb.*","moviesite.app","moviesverse.*","moviexxx.mobi","mp3-gratis.it","mp3fusion.net","mp3juices.icu","mp4mania1.net","mp4upload.com","mrpeepers.net","mtech4you.com","mtg-print.com","multicanais.*","musicsite.biz","musikradar.de","mustang6g.com","mustang7g.com","myadslink.com","myfernweh.com","myflixertv.to","myhindigk.com","myicloud.info","myshopify.com","mysostech.com","mythvista.com","myvidplay.com","myvidster.com","myyouporn.com","naijahits.com","nakastream.tv","nakenprat.com","napolipiu.com","nastybulb.com","nation.africa","natomanga.com","naturalbd.com","nbcsports.com","ncdexlive.org","needrombd.com","neilpatel.com","nekolink.site","nelomanga.net","nesiaku.my.id","netcinebs.lat","netfilmes.org","netnaijas.com","nettiauto.com","neuepresse.de","neurotray.com","nevcoins.club","neverdims.com","newportri.com","newschief.com","newstopics.in","newyorker.com","newzjunky.com","nexusgames.to","nexusmods.com","nflstreams.me","nhvnovels.com","nicematin.com","nicomanga.com","nihonkuni.com","nin10news.com","nklinks.click","nlcosplay.com","noblocktape.*","noikiiki.info","noob4cast.com","noor-book.com","nordbayern.de","notevibes.com","nousdecor.com","novamovie.net","novelcrow.com","novelroom.net","novizer.com>>","nsfwalbum.com","nsfwhowto.xyz","nudegista.com","nudistube.com","nuhuskies.com","nukibooks.com","nulledmug.com","nupload.top>>","nuviatoon.com","nvimfreak.com","nwemail.co.uk","nwusports.com","oakridger.com","odiadance.com","odiafresh.com","officedepot.*","ogoplayer.xyz","ohmybrush.com","ojogos.com.br","okhatrimaza.*","oklahoman.com","onemanhua.com","onlinegdb.com","onlyssh.my.id","onlystream.tv","op-marburg.de","openloadmov.*","openlua.cloud","ostreaming.tv","otakuliah.com","otakuporn.com","ottawasun.com","ovcsports.com","owlsports.com","ozulscans.com","padovaoggi.it","pagalfree.com","pagalmovies.*","pagalworld.us","paidnaija.com","paipancon.com","panuvideo.com","paolo9785.com","parisporn.org","parmatoday.it","pasteboard.co","pastelink.net","patchsite.net","pawastreams.*","pc-builds.com","pc-magazin.de","peacocktv.com","peladas69.com","peliculas24.*","pelisflix20.*","pelisgratis.*","pelismart.com","pelisplusgo.*","pelisplushd.*","pelisplusxd.*","pelisstar.com","penterosa.lat","perplexity.ai","pervclips.com","pg-wuming.com","phimfun.net>>","pianokafe.com","pic-upload.de","picbcxvxa.sbs","pichaloca.com","pics-view.com","pienovels.com","pincong.rocks","piraproxy.app","pirateproxy.*","pitchfork.com","pixbkghxa.sbs","pixbryexa.sbs","pixnbrqwg.sbs","pixtryab.shop","pkbiosfix.com","pkproject.net","plattformj.ch","player.stv.tv","player4me.vip","playfmovies.*","playpaste.com","plugincim.com","pocketnow.com","poco.rcccn.in","pokemundo.com","polska-ie.com","popcorntime.*","porn4fans.com","pornbaker.com","pornbimbo.com","pornblade.com","pornborne.com","pornchaos.org","pornchimp.com","porncomics.me","porncoven.com","porndollz.com","porndrake.com","pornfelix.com","pornfuzzy.com","pornloupe.com","pornmonde.com","pornoaffe.com","pornobait.com","pornocomics.*","pornoeggs.com","pornohaha.com","pornohans.com","pornohelm.com","pornokeep.com","pornoleon.com","pornomico.com","pornonline.cc","pornonote.pro","pornoplum.com","pornproxy.app","pornproxy.art","pornretro.xyz","pornslash.com","porntopic.com","porntube18.cc","posterify.net","pourcesoir.in","povaddict.com","powforums.com","pravda.com.ua","pregledaj.net","pressplay.cam","pressplay.top","prignitzer.de","primeflix.*>>","primewire.*>>","proboards.com","produktion.de","promiblogs.de","prostoporno.*","protestia.com","protopage.com","pureleaks.net","pussy-hub.com","pussyspot.net","putlockertv.*","puzzlefry.com","pvpoke-re.com","pygodblog.com","quesignifi.ca","quicasting.it","quickporn.net","rainytube.com","ranourano.xyz","rbscripts.net","read.amazon.*","readingbd.com","realbooru.com","realhomes.com","realmadryt.pl","rechtslupe.de","recordnet.com","redhdtube.xxx","redketchup.io","redsexhub.com","reliabletv.me","repelisgooo.*","restorbio.com","reviewdiv.com","rexdlfile.com","ridvanmau.com","riggosrag.com","ritzyporn.com","rocdacier.com","rockradio.com","rojadirecta.*","romsgames.net","romspedia.com","rossoporn.com","rottenlime.pw","roystream.com","rufiiguta.com","rule34.jp.net","rumbunter.com","ruyamanga.com","s.sseluxx.com","saabscene.com","sagewater.com","sarapbabe.com","sarforums.com","sassytube.com","savefiles.com","scatkings.com","scimagojr.com","scrapywar.com","scrolller.com","selfhostt.com","sendspace.com","seneporno.com","sensacine.com","seriesite.net","set.seturl.in","sex-babki.com","sexbixbox.com","sexbox.online","sexdicted.com","sexmazahd.com","sexmutant.com","sexphimhd.net","sextube-6.com","sexyscope.net","sexytrunk.com","sfastwish.com","sfirmware.com","shameless.com","share.hntv.tv","share1223.com","sharemods.com","sharkfish.xyz","sharphindi.in","shemaleup.net","short-fly.com","short1ink.com","shortlinkto.*","shortlist.com","shortnest.com","shortpaid.com","shorttrick.in","shownieuws.nl","shroomers.app","siimanga.cyou","simana.online","simplebits.io","simpmusic.org","sissytube.net","sitefilme.com","sitegames.net","sk8therapy.fr","skymovieshd.*","slashlook.com","slashview.com","slotforum.com","smartworld.it","smashkarts.io","snackfora.com","snapwordz.com","socigames.com","soft8ware.com","softcobra.com","softfully.com","sohohindi.com","solarmovie.id","solarmovies.*","solotrend.net","sosovalue.com","sparktalk.com","speedporn.net","speedtest.net","speedwake.com","speedweek.com","speypages.com","spfutures.org","spokesman.com","spontacts.com","sportbar.live","sportlemons.*","sportlemonx.*","sportowy24.pl","sports.qq.com","sportsbite.cc","sportsembed.*","sportsnest.co","sportsrec.com","sportweb.info","spotsaver.net","spring.org.uk","sr20forum.com","srtforums.com","ssyoutube.com","stagemilk.com","stalkface.com","starsgtech.in","startseite.to","statesman.com","ster-blog.xyz","steyrclub.com","stock-rom.com","str8ongay.com","strand-co.com","stre4mpay.one","stream-69.com","stream4free.*","streambtw.com","streamcash.to","streamcloud.*","streamfree.to","streamhd247.*","streamobs.net","streampoi.com","streamporn.cc","streamsport.*","streamta.site","streamtp1.com","streamvid.dev","streamvid.net","strefaagro.pl","striptube.net","stylist.co.uk","subtitles.cam","subtorrents.*","suedkurier.de","sulleiman.com","sunporno.club","superstream.*","supervideo.tv","supforums.com","sv-portal.com","swisscows.com","switch520.com","sylverkat.com","sysguides.com","szexkepek.net","szexvideok.hu","t-rocforum.de","tab-maker.com","taboodude.com","taigoforum.de","talksport.com","tamilarasan.*","tamilguns.org","tamilhit.tech","tapenoads.com","tatsublog.com","techacode.com","techbixby.com","techclips.net","techdriod.com","techilife.com","technofino.in","techradar.com","techrecur.com","techtrim.tech","techybuff.com","techyrick.com","teenvogue.com","tehnotone.com","teknisitv.com","temp-mail.lol","temp-mail.org","tempumail.com","tennis.stream","ternitoday.it","terrylove.com","testsieger.de","texastech.com","theintell.com","thejournal.ie","thelayoff.com","theledger.com","thememypc.net","thenation.com","thestreet.com","thetemp.email","thethings.com","thetravel.com","theuser.cloud","theweek.co.uk","thichcode.net","thiepmung.com","thotpacks.xyz","thotslife.com","tierfreund.co","tierlists.com","timescall.com","tinyzonetv.cc","tinyzonetv.se","tiz-cycling.*","tmohentai.com","to-travel.net","tok-thots.com","tokopedia.com","tokuzilla.net","tomsguide.com","tonuriaz.info","topwwnews.com","torgranate.de","torrentz2eu.*","torupload.com","totalcsgo.com","totaldebrid.*","tourporno.com","towerofgod.me","trade2win.com","trailerhg.xyz","trangchu.news","transfaze.com","transflix.net","transtxxx.com","tremamnon.com","tribeclub.com","tricksplit.io","trigonevo.com","tsubasatr.org","tubehqxxx.com","tubemania.org","tubereader.me","tudigitale.it","tudotecno.com","tukipasti.com","tunabagel.net","tunemovie.fun","turkleech.com","tutcourse.com","tvfutbol.info","twink-hub.com","twojeip.wp.pl","twstalker.com","txxxporn.tube","uberhumor.com","ubuntudde.com","udemyking.com","udinetoday.it","uhcougars.com","uicflames.com","uniqueten.net","unlockapk.com","unlockxh4.com","unnuetzes.com","unterhalt.net","up4stream.com","upfilesgo.com","uploadgig.com","uptogo.com.tw","uptoimage.com","urgayporn.com","utrockets.com","uwbadgers.com","vectorizer.io","vegamoviese.*","veoplanet.com","verhentai.top","vermoegen.org","vibestreams.*","vibraporn.com","vid-guard.com","vidaextra.com","videoplayer.*","vidora.stream","vidspeeds.com","vidstream.pro","viefaucet.com","villanova.com","vintagetube.*","vipergirls.to","vipserije.com","vipstand.pm>>","visionias.net","visnalize.com","vixenless.com","vkrovatku.com","voidtruth.com","voiranime1.fr","voirseries.io","vosfemmes.com","vpntester.org","vpzserver.com","vstplugin.net","vuinsider.com","w3layouts.com","wallpaper.com","waploaded.com","warezsite.net","watch.plex.tv","watchdirty.to","watchluna.com","watchmovies.*","watchseries.*","watchsite.net","watchtv24.com","wdpglobal.com","weatherwx.com","weirdwolf.net","wendycode.com","westmanga.org","wetpussy.sexy","wg-gesucht.de","whoreshub.com","whtimes.co.uk","widewifes.com","wikipekes.com","wikitechy.com","willcycle.com","windowspro.de","wkusports.com","wlz-online.de","wmagazine.com","wmoviesfree.*","wonderapk.com","workink.click","world4ufree.*","worldfree4u.*","worldsports.*","worldstar.com","worldtop2.com","wowescape.com","wunderweib.de","wvusports.com","www.amazon.de","www.seznam.cz","www.twitch.tv","www.yahoo.com","x-fetish.tube","x-videos.name","xanimehub.com","xgcartoon.com","xhbranch5.com","xhchannel.com","xhlease.world","xhplanet1.com","xhplanet2.com","xhvictory.com","xhwebsite.com","xmovies08.org","xnxxjapon.com","xoxocomic.com","xrivonet.info","xsportbox.com","xsportshd.com","xxvideoss.org","xxx-image.com","xxxbunker.com","xxxcomics.org","xxxfree.watch","xxxhothub.com","xxxscenes.net","xxxvideo.asia","xxxvideor.com","y2meta-uk.com","yachtrevue.at","yandexcdn.com","yaoiotaku.com","ycongnghe.com","yeshuyuan.com","yesmovies.*>>","yesmovies4u.*","yeswegays.com","ymp4.download","yogitimes.com","youjizzz.club","youlife24.com","youngleak.com","youpornfm.com","youtubeai.com","yoyofilmeys.*","yt1s.com.co>>","yumekomik.com","zamundatv.com","zekamashi.net","zerotopay.com","zhenbuka3.com","zigforums.com","zinkmovies.in","zmamobile.com","zoompussy.com","zorroplay.xyz","0dramacool.net","111.90.141.252","111.90.150.149","111.90.159.132","1111fullwise.*","123animehub.cc","123moviefree.*","123movierulz.*","123movies4up.*","123moviesd.com","123movieshub.*","174.127.195.98","185.193.17.214","188.166.182.72","18girlssex.com","1cloudfile.com","1pack1goal.com","1primewire.com","1shortlink.com","1stkissmanga.*","3gpterbaru.com","3rabsports.com","4everproxy.com","69hoshudaana.*","69teentube.com","ab.nanacdn.com","absolugirl.com","absolutube.com","admiregirls.su","adnan-tech.com","adrissa.com.co","adsafelink.com","afilmywapi.biz","agedvideos.com","airsextube.com","akumanimes.com","akutsu-san.com","alexsports.*>>","aliexpress.com","alimaniacky.cz","allbbwtube.com","allcalidad.app","allcelebs.club","allmovieshub.*","allosoccer.com","allpremium.net","alluretube.com","allwpworld.com","almezoryae.com","alphaporno.com","amanguides.com","amateurfun.net","amateurporn.co","amigosporn.top","ancensored.com","anconatoday.it","androgamer.org","ani-stream.com","anime4mega.net","animeblkom.net","animefire.info","animefire.plus","animeheaven.ru","animeindo.asia","animeshqip.org","animespank.com","animesvision.*","anonymfile.com","anyxvideos.com","aozoraapps.net","app.cekresi.me","appsfree4u.com","arab4media.com","arabincest.com","arabxforum.com","arealgamer.org","ariversegl.com","arlinadzgn.com","armyranger.com","articlebase.pk","artoffocas.com","ashemaletube.*","ashemaletv.com","asianporn.sexy","asianwatch.net","askpaccosi.com","askushowto.com","assesphoto.com","atlantic10.com","autocentrum.pl","autopareri.com","av1encodes.com","axutongxue.com","axutongxue.net","axutongxue.vip","b3infoarena.in","balkanteka.net","bamahammer.com","bantenexis.com","batmanstream.*","battleboats.io","bbwfuckpic.com","bcanepaltu.com","bcsnoticias.mx","bdsmstreak.com","bdsomadhan.com","bdstarshop.com","beegvideoz.com","belloporno.com","benzinpreis.de","bergwelten.com","best18porn.com","bestofarea.com","betaseries.com","bgmiesports.in","bharian.com.my","bidersnotu.com","bildderfrau.de","bingotingo.com","bit-shares.com","bitcotasks.com","bitcrypto.info","bittukitech.in","blackcunts.org","blackteen.link","blocklayer.com","blowjobgif.net","bluedollar.net","boersennews.de","bolly-tube.com","bollywoodx.org","bonappetit.com","bonstreams.net","boobieblog.com","boobsradar.com","boobsrealm.com","boredgiant.com","boxaoffrir.com","brainknock.net","bravoteens.com","bravotube.asia","brightpets.org","brulosophy.com","btcadspace.com","btvnovinite.bg","bustmonkey.com","bustybloom.com","bysefujedu.com","bysejikuar.com","byseqekaho.com","byseraguci.com","bysesukior.com","bysetayico.com","cacfutures.org","cadenadial.com","calculate.plus","calgarysun.com","camgirlbay.net","camgirlfap.com","camsstream.com","canalporno.com","caracol.com.co","cardscanner.co","carrnissan.com","casertanews.it","cdn.gledaitv.*","celebjihad.com","celebretea.com","celebwhore.com","cellmapper.net","cesenatoday.it","cg-gamespc.net","chachocool.com","chanjaeblog.jp","chart.services","chatgptfree.ai","chaturflix.cam","cheatermad.com","chietitoday.it","cincinnati.com","cine-calidad.*","cinemalibero.*","cinepiroca.com","claimcrypto.cc","claimlite.club","clasicotas.org","clicknupload.*","clipartmax.com","cloudflare.com","cloudhostt.com","cloudvideotv.*","club-flank.com","cntraveler.com","codeandkey.com","coinadpro.club","coloradoan.com","comdotgame.com","comicsarmy.com","comixzilla.com","compromath.com","comunio-cl.com","convert2mp3.cx","coolrom.com.au","courseboat.com","coverapi.space","coverapi.store","cpu-monkey.com","crackshash.com","cracksports.me","crazygames.com","crazyvidup.com","creebhills.com","crichdplays.ru","cricwatch.io>>","croq-kilos.com","crunchyscan.fr","crypt.cybar.to","cryptoforu.org","cryptonetos.ru","cryptstream.de","csgo-ranks.com","cuckoldsex.net","curseforge.com","cwtvembeds.com","cyberscoop.com","czechvideo.org","daddylive.link","dafreeporn.com","dagensnytt.com","daily-jeff.com","dailycomet.com","dailylocal.com","dailyworld.com","dallasnews.com","dansmovies.com","daotranslate.*","daxfutures.org","dayuploads.com","ddwloclawek.pl","decompiler.com","defenseone.com","delcotimes.com","derstandard.at","derstandard.de","desicinema.org","desicinemas.pk","designbump.com","desiremovies.*","desktophut.com","devdrive.cloud","deviantart.com","devuploads.com","diampokusy.com","dianyingim.com","dicariguru.com","dieblaue24.com","digipuzzle.net","direct-cloud.*","dirtytamil.com","disneyplus.com","dobletecno.com","dodgersway.com","dogsexporn.net","doseofporn.com","dotesports.com","dotfreesex.com","dotfreexxx.com","doujinnote.com","dowfutures.org","downloadming.*","drakecomic.com","dreamfancy.org","duniailkom.com","dvdgayporn.com","dvdporngay.com","e123movies.com","easytodoit.com","ebooksyard.com","ecacsports.com","echo-online.de","ed-protect.org","eddiekidiw.com","eftacrypto.com","elaoffcial.com","elcorreoweb.es","electomania.es","elitegoltv.org","elitetorrent.*","elmalajeno.com","emailnator.com","embedorigin.cc","embedsports.me","embedstream.me","emojipedia.org","empire-anime.*","emturbovid.com","emugameday.com","enryumanga.com","ensuretips.com","epicstream.com","epicurious.com","ericdraken.com","erinsakura.com","erokomiksi.com","eroprofile.com","esgentside.com","esportivos.fun","este-walks.net","estrenosflix.*","estrenosflux.*","ethiopia.co.il","euronews.com>>","eveningsun.com","examscisco.com","exbulletin.com","expertplay.net","exteenporn.com","extratorrent.*","extreme-down.*","eztvtorrent.co","f123movies.com","faaduindia.com","fairyanime.com","fakazagods.com","fakedetail.com","fanatik.com.tr","fantacalcio.it","fap-nation.org","faperplace.com","faselhdwatch.*","fastdour.store","fatxxxtube.com","faucetdump.com","fduknights.com","fetishburg.com","fettspielen.de","fhmemorial.com","fibwatch.store","filemirage.com","fileplanet.com","filesharing.io","filesupload.in","film-adult.com","filme-bune.biz","filmifen.com>>","filmpertutti.*","filmy4waps.org","filmypoints.in","filmyzones.com","filtercams.com","finanztreff.de","finderporn.com","findtranny.com","fine-wings.com","firefaucet.win","fitandwell.com","fitdynamos.com","fleamerica.com","flostreams.xyz","flycutlink.com","fmoonembed.pro","foodgustoso.it","foodiesjoy.com","foodtechnos.in","football365.fr","fooxybabes.com","forex-trnd.com","freeforums.net","freegayporn.me","freehqtube.com","freeltc.online","freemodsapp.in","freepasses.org","freepreset.net","freesoccer.net","freesolana.top","freetubetv.net","freiepresse.de","freshplaza.com","freshremix.net","frostytube.com","fu-4u3omzw0.nl","fucktube4k.com","fuckundies.com","fullporner.com","fullvoyeur.com","gadgetbond.com","gamebanana.com","gamefi-mag.com","gameofporn.com","games.amny.com","games.insp.com","games.metro.us","games.metv.com","games.wtop.com","games2rule.com","games4king.com","gamesgames.com","gamesleech.com","gamesradar.com","gayforfans.com","gaypornhot.com","gayxxxtube.net","gazettenet.com","gdr-online.com","gdriveplayer.*","gearjunkie.com","gecmisi.com.tr","genovatoday.it","getintopcm.com","getintoway.com","gettapeads.com","gisvacancy.com","gknutshell.com","gkstreams1.*>>","gkstreams2.*>>","gloryshole.com","gobearcats.com","gofirmware.com","goislander.com","golfdigest.com","golightsgo.com","gomoviesfree.*","gomovieshub.io","goodreturns.in","goodstream.one","googlvideo.com","gorecenter.com","gorgeradio.com","gosbagotui.com","goshockers.com","gostanford.com","gostreamon.net","goterriers.com","gotgayporn.com","gotigersgo.com","gourmandix.com","gousfbulls.com","govtportal.org","grannysex.name","grantorrent1.*","grantorrents.*","graphicget.com","growgritly.com","grubstreet.com","guitarnick.com","gujjukhabar.in","gurbetseli.net","guruofporn.com","gutfuerdich.co","gyanitheme.com","gyonlineng.com","haloursynow.pl","hanime1-me.icu","hanime1-me.top","hardcorehd.xxx","haryanaalert.*","hausgarten.net","hawtcelebs.com","hdhub4one.pics","hdmovies23.com","hdmoviesfair.*","hdmoviesflix.*","hdmoviesmaza.*","hdpornteen.com","healthelia.com","healthmyst.com","hentai-for.net","hentai-hot.com","hentai-one.com","hentaiasmr.moe","hentaiblue.net","hentaibros.com","hentaicity.com","hentaidays.com","hentaihere.com","hentaipins.com","hentairead.com","hentaisenpai.*","hentaiworld.tv","heraldnews.com","heysigmund.com","hidefninja.com","hilaryhahn.com","hinatasoul.com","hindilinks4u.*","hindimovies.to","hindiporno.pro","hit-erotic.com","hollymoviehd.*","homebooster.de","homeculina.com","horoskop.wp.pl","hortidaily.com","hotcleaner.com","hotgirlhub.com","hotgirlpix.com","houmatoday.com","howtocivil.com","hpaudiobooks.*","hyogo.ie-t.net","hypershort.com","i123movies.net","iconmonstr.com","idealfollow.in","idlelivelink.*","ilifehacks.com","ilikecomix.com","imagetwist.com","imgjbxzjv.shop","imgjmgfgm.shop","imgjvmbbm.shop","imgnnnvbrf.sbs","in-cumbria.com","inbbotlist.com","indeonline.com","indi-share.com","indiatimes.com","indopanas.cyou","infocycles.com","infokita17.com","infomaniakos.*","informacion.es","inhumanity.com","insidenova.com","instaporno.net","ios.codevn.net","iqksisgw.xyz>>","isekaitube.com","issstories.xyz","itechfever.com","itopmusics.com","itopmusicx.com","iuhoosiers.com","iwatchme2u.com","jacksonsun.com","jacksorrell.tv","jalshamoviez.*","janamathaya.lk","japannihon.com","javaguides.net","javbangers.com","javggvideo.xyz","javhdvideo.org","javheroine.com","javlibrary.com","javplayers.com","javsexfree.com","javsubindo.com","javtsunami.com","javxxxporn.com","jeniusplay.com","jewelry.com.my","jizzbunker.com","join2babes.com","joyousplay.xyz","jpopsingles.eu","juegoviejo.com","jugomobile.com","juicy3dsex.com","justababes.com","justembeds.xyz","justthegays.tv","kaboomtube.com","kahanighar.com","kakarotfoot.ru","kannadamasti.*","kashtanka2.com","keepkoding.com","kendralist.com","kgs-invest.com","khabarbyte.com","kickassanime.*","kickasshydra.*","kiddyshort.com","kindergeld.org","kingofdown.com","kiradream.blog","kisahdunia.com","kits4beats.com","klartext-ne.de","kokostream.net","komikmanhwa.me","kompasiana.com","kongregate.com","kordramass.com","kurakura21.com","ladkibahin.com","lampungway.com","laprovincia.es","laradiobbs.net","laser-pics.com","latinatoday.it","lauradaydo.com","layardrama21.*","lcsun-news.com","leaderpost.com","leakedzone.com","leakshaven.com","learnospot.com","lebahmovie.com","ledauphine.com","lenconnect.com","lesboluvin.com","lesfoodies.com","letmejerk2.com","letmejerk3.com","letmejerk4.com","letmejerk5.com","letmejerk6.com","letmejerk7.com","lewdcorner.com","lifehacker.com","ligainsider.de","limetorrents.*","linemarlin.com","link.vipurl.in","linkconfig.com","livecamrips.to","livenewsof.com","lizardporn.com","login.asda.com","lokhung888.com","lookmovie186.*","ludwig-van.com","lulustream.com","m.liputan6.com","m.shuhaige.net","macheforum.com","mactechnews.de","macworld.co.uk","mad4wheels.com","madchensex.com","madmaxworld.tv","mahitimanch.in","mail.yahoo.com","main-spitze.de","maliekrani.com","manga4life.com","mangamovil.net","manganatos.com","mangaraw18.net","mangarawad.fit","mangareader.to","mangatrend.org","manhuarmtl.com","manhuascan.com","manhwaclub.net","manhwalist.com","manhwaread.com","marionstar.com","marketbeat.com","masteranime.tv","mathepower.com","maths101.co.za","matureworld.ws","mcafee-com.com","mega-debrid.eu","megacanais.com","megalinks.info","megamovies.org","megapastes.com","mehr-tanken.de","mejortorrent.*","mercato365.com","meteologix.com","mewingzone.com","miiiixdrop.net","milanotoday.it","milanworld.net","milffabrik.com","minecraft.buzz","minorpatch.com","mixmods.com.br","mixrootmod.com","mjsbigblog.com","mkv-pastes.com","mobileporn.cam","mockupcity.com","modapkfile.com","moddedguru.com","modenatoday.it","moegirl.org.cn","mommybunch.com","mommysucks.com","momsextube.pro","monroenews.com","morrowplay.com","motchill29.com","motogpstream.*","motorcycle.com","motorgraph.com","motorsport.com","motscroises.fr","movearnpre.com","moviefree2.com","movies2watch.*","moviesapi.club","movieshd.watch","moviesjoy-to.*","moviesjoyhd.to","moviesnation.*","movisubmalay.*","mprogaming.com","msm-wroclaw.pl","mtsproducoes.*","multiplayer.it","mummumtime.com","musicradar.com","musketfire.com","mxpacgroup.com","mycoolmoviez.*","mydesibaba.com","myforecast.com","myglamwish.com","myinstants.com","mylifetime.com","mynewsmedia.co","mypornhere.com","myporntape.com","mysexgamer.com","mysexgames.com","myshrinker.com","mytectutor.com","naasongsfree.*","naijauncut.com","nammakalvi.com","naplesnews.com","naszemiasto.pl","navysports.com","nazarickol.com","nensaysubs.net","neonxcloud.top","neservicee.com","netchimp.co.uk","new.lewd.ninja","newmovierulz.*","news-press.com","newsbreak24.de","newscard24.com","newsherald.com","newsleader.com","ngontinh24.com","nicheporno.com","nichetechy.com","nikaplayer.com","ninernoise.com","nirjonmela.com","nishankhatri.*","niteshyadav.in","nitro-link.com","nitroflare.com","niuhuskies.com","nodenspace.com","nosteam.com.ro","notunmovie.net","notunmovie.org","novaratoday.it","novel-gate.com","novelaplay.com","novelgames.com","novostrong.com","nowosci.com.pl","nudebabes.sexy","nudisteens.com","nulledbear.com","nulledteam.com","nullforums.net","nulljungle.com","nurulislam.org","nylondolls.com","ocregister.com","officedepot.fr","oggitreviso.it","okamimiost.com","omegascans.org","onlineatlas.us","onlinekosh.com","onlineporno.cc","openstartup.tm","opentunnel.net","oregonlive.com","organismes.org","orgasmlist.com","orgyxxxhub.com","orovillemr.com","osubeavers.com","osuskinner.com","oteknologi.com","ourenseando.es","overhentai.net","packhacker.com","palapanews.com","palofw-lab.com","pandamovies.me","pandamovies.pw","pandanote.info","pantieshub.net","paradepets.com","paris-tabi.com","paste-drop.com","paylaterin.com","peachytube.com","pekintimes.com","pelismartv.com","pelismkvhd.com","pelispedia24.*","pelispoptv.com","pemersatu.link","perfectgirls.*","perfektdamen.*","pervertium.com","perverzija.com","pethelpful.com","petitestef.com","pherotruth.com","phoneswiki.com","picgiraffe.com","picjgfjet.shop","pictryhab.shop","picturelol.com","pimylifeup.com","pink-sluts.net","pirate4all.com","pirateblue.com","pirateblue.net","pirateblue.org","piratemods.com","pivigames.blog","planetsuzy.org","platinmods.com","play-games.com","play.xpass.top","playcast.click","player-cdn.com","player.rtl2.de","player.sbnmp.*","playermeow.com","playertv24.com","playhydrax.com","podkontrola.pl","polsatsport.pl","polskatimes.pl","pop-player.com","popno-tour.net","porconocer.com","porn0video.com","pornahegao.xyz","pornasians.pro","pornerbros.com","pornflixhd.com","porngames.club","pornharlot.net","pornhd720p.com","pornincest.net","pornissimo.org","pornktubes.net","pornodavid.com","pornodoido.com","pornofelix.com","pornofisch.com","pornojenny.net","pornoperra.com","pornopics.site","pornoreino.com","pornotommy.com","pornotrack.net","pornozebra.com","pornrabbit.com","pornrewind.com","pornsocket.com","porntrex.video","porntube15.com","porntubegf.com","pornvideoq.com","pornvintage.tv","portaldoaz.org","portalyaoi.com","poscitechs.lol","powerover.site","premierftp.com","prepostseo.com","presscarry.com","pressemedie.dk","primagames.com","primemovies.pl","primevid.click","primevideo.com","printables.com","proapkdown.com","pruefernavi.de","purediablo.com","pussyspace.com","pussyspace.net","pussystate.com","put-locker.com","putingfilm.com","puzzleship.com","queerdiary.com","querofilmehd.*","questloops.com","rabbitsfun.com","radiopogoda.pl","radiotimes.com","radiotunes.com","rahim-soft.com","ramblinfan.com","rankersadda.in","ravenscans.com","rbxscripts.net","rcostation.xyz","realbbwsex.com","realgfporn.com","realmoasis.com","realmomsex.com","record-bee.com","recordbate.com","redecanaishd.*","redecanaistv.*","redfaucet.site","rednowtube.com","redpornnow.com","redtubemov.com","reggiotoday.it","resortcams.com","revealname.com","reviersport.de","reviewrate.net","revivelink.com","richtoscan.com","riminitoday.it","ringelnatz.net","ripplehub.site","rlxtech24h.com","rmacsports.org","roadtrippin.fr","robbreport.com","rokuhentai.com","rollrivers.com","rollstroll.com","romaniasoft.ro","romhustler.org","royaledudes.io","rpmplay.online","rpmstream.live","ruanyifeng.com","rubyvidhub.com","rugbystreams.*","ruinmyweek.com","rule34video.co","russland.jetzt","rusteensex.com","ruyashoujo.com","safefileku.com","safemodapk.com","samaysawara.in","sanfoundry.com","saratogian.com","sat.technology","sattaguess.com","saveshared.com","savevideo.tube","sciencebe21.in","scoreland.name","scrap-blog.com","screenflash.io","screenrant.com","scriptsomg.com","scriptsrbx.com","scriptzhub.com","section215.com","seeitworks.com","seekplayer.vip","seirsanduk.com","seksualios.com","selfhacked.com","serienstream.*","series2watch.*","seriesonline.*","seriesperu.com","seriesyonkis.*","serijehaha.com","severeporn.com","sex-empire.org","sex-movies.biz","sexcams-24.com","sexgamescc.com","sexgayplus.com","sextubedot.com","sextubefun.com","sextubeset.com","sexvideos.host","sexyaporno.com","sexybabes.club","sexybabesz.com","sexynakeds.com","sgvtribune.com","shahid.mbc.net","sharedwebs.com","shazysport.pro","sheamateur.com","sheeshfans.com","shegotass.info","sheikhmovies.*","shelbystar.com","shemalesin.com","shesfreaky.com","shinobijawi.id","shooshtime.com","shop123.com.tw","short-url.link","shorterall.com","shrinkearn.com","shueisharaw.tv","shupirates.com","siennachat.com","sieutamphim.me","sigarms556.com","siliconera.com","sitarchive.com","siusalukis.com","skat-karten.de","slatedroid.com","slickdeals.net","slidesaver.app","slideshare.net","smartinhome.pl","smarttrend.xyz","smiechawatv.pl","snhupenmen.com","solanforum.com","solidfiles.com","soranews24.com","soundboards.gg","spaziogames.it","speedostream.*","speedzilla.com","speisekarte.de","spiele.bild.de","spieletipps.de","spiritword.net","spoilerplus.tv","sportbikes.net","sporteurope.tv","sportsdark.com","sportsonline.*","sportsurge.net","sproutgigs.com","spy-x-family.*","spyderchat.com","spydertalk.com","srt10forum.com","srt4mation.com","ssrfanatic.com","stadelahly.net","stahnivideo.cz","standard.co.uk","stardewids.com","starzunion.com","stbemuiptv.com","steamverde.net","stireazilei.eu","storiesig.info","storyblack.com","stownrusis.com","straemplay.org","stream2watch.*","streamdesi.com","streamfile.net","streamlord.com","streamruby.com","streamxtv.tech","stripehype.com","studydhaba.com","subtitleone.cc","subtorrents1.*","super-games.cz","superanimes.in","superhonda.com","suvvehicle.com","svetserialu.io","svetserialu.to","swatchseries.*","swedespeed.com","swordalada.org","tainhanhvn.com","talkceltic.net","talkjarvis.com","tamilnaadi.com","tamilprint29.*","tamilprint30.*","tamilprint31.*","tamilprinthd.*","tangdoucdn.com","taradinhos.com","tarnkappe.info","taschenhirn.de","tech-blogs.com","tech-story.net","techcrunch.com","techhelpbd.com","techiestalk.in","techkeshri.com","techmyntra.net","techperiod.com","techsignin.com","techsslash.com","tecnoaldia.net","tecnobillo.com","tecnoscann.com","tecnoyfoto.com","teenager365.to","teenextrem.com","teenhubxxx.com","teensexass.com","tekkenmods.com","teknoasian.com","telemagazyn.pl","teleshow.wp.pl","telesrbija.com","televiziebi.tv","temp.modpro.co","tennessean.com","tennisactu.net","testserver.pro","textograto.com","textovisia.com","texturecan.com","the-leader.com","the-review.com","theargus.co.uk","theavtimes.com","thefantazy.com","theflixertv.to","thegleaner.com","thehesgoal.com","theinertia.com","themeslide.com","thenetnaija.co","thepiratebay.*","theporngod.com","therichest.com","thesextube.net","thetakeout.com","thethothub.com","thetimes.co.uk","thevideome.com","thewambugu.com","thotchicks.com","titsintops.com","tojimangas.com","tomshardware.*","topcartoons.tv","topsporter.net","topwebgirls.eu","torinotoday.it","tormalayalam.*","torontosun.com","torovalley.net","torrentmac.net","totalsportek.*","tournguide.com","tous-sports.ru","towerofgod.top","tpornstars.com","tradingref.com","trancehost.com","trannyline.com","trashbytes.net","traumporno.com","travelhost.com","trendflatt.com","trentonian.com","trentotoday.it","tribunnews.com","tronxminer.com","truckscout24.*","tuberzporn.com","tubesafari.com","tubexxxone.com","tukangsapu.net","turbocloud.xyz","turkish123.com","tv-films.co.uk","tv.youtube.com","tvspielfilm.de","twincities.com","u123movies.com","ucfknights.com","uciteljica.net","uclabruins.com","ufreegames.com","uiuxsource.com","uktvplay.co.uk","unblocked.name","unblocksite.pw","uncpbraves.com","uncwsports.com","unlvrebels.com","uoflsports.com","uploadbank.com","uploadking.net","uploadmall.com","uploadraja.com","upnewsinfo.com","uptostream.com","urlbluemedia.*","urldecoder.org","usctrojans.com","usdtoreros.com","usersdrive.com","utepminers.com","uyduportal.net","v-wb.youku.com","v2movies.click","vanityfair.com","vavada5com.com","vbox7-mp3.info","vegamovies4u.*","vegamovvies.to","veo-hentai.com","vestimage.site","video-seed.xyz","video1tube.com","videogamer.com","videolyrics.in","videos1002.com","videoseyred.in","videosgays.net","vidguardto.xyz","vidhidepre.com","vidhidevip.com","vidquickly.com","vidstreams.net","view.ceros.com","viewmature.com","vikistream.com","viralpedia.pro","visortecno.com","vmorecloud.com","voiceloves.com","voipreview.org","voltupload.com","voyeurblog.net","vulgarmilf.com","vviruslove.com","wantmature.com","warefree01.com","watch-series.*","watchasians.cc","watchomovies.*","watchpornx.com","watchseries1.*","watchseries9.*","wawalove.wp.pl","wcoanimedub.tv","wcoanimesub.tv","wcoforever.net","webseries.club","weihnachten.me","wenxuecity.com","westmanga.info","wetteronline.*","whatfontis.com","whatismyip.com","whats-new.cyou","whatshowto.com","whodatdish.com","whoisnovel.com","wiacsports.com","wifi4games.com","windbreaker.me","wizhdsports.fi","wkutickets.com","wmubroncos.com","womennaked.net","world4ufree1.*","worldofbin.com","worthcrete.com","wow-mature.com","wowxxxtube.com","wspolczesna.pl","wsucougars.com","www-y2mate.com","www.amazon.com","www.reddit.com","www.tiktok.com","x2download.com","xanimeporn.com","xclusivejams.*","xdld.pages.dev","xerifetech.com","xfrenchies.com","xhofficial.com","xhomealone.com","xhwebsite5.com","xiaomi-miui.gr","xmegadrive.com","xnxxporn.video","xxx-videos.org","xxxbfvideo.net","xxxblowjob.pro","xxxdessert.com","xxxextreme.org","xxxtubedot.com","xxxtubezoo.com","xxxvideohd.net","xxxxselfie.com","xxxymovies.com","xxxyoungtv.com","yabaisub.cloud","yakisurume.com","yomucomics.com","yottachess.com","youngbelle.net","youporngay.com","youtubetomp3.*","yoututosjeff.*","yuki0918kw.com","yumstories.com","yunakhaber.com","zazzybabes.com","zentralplus.ch","zertalious.xyz","zippyshare.day","zona-leros.com","zonebourse.com","zooredtube.com","0123movie.space","10hitmovies.com","123movies-org.*","123moviesfree.*","123moviesfun.is","18-teen-sex.com","18asiantube.com","18porncomic.com","18teen-tube.com","1direct-cloud.*","1vid1shar.space","3xamatorszex.hu","4allprograms.me","5masterzzz.site","6indianporn.com","abyssplayer.com","adhs-zentrum.de","admediaflex.com","adminreboot.com","adrianoluis.net","adrinolinks.com","advicefunda.com","aeroxplorer.com","aflizmovies.com","agrarwetter.net","ai.hubtoday.app","aitoolsfree.org","alanyapower.com","aliezstream.pro","allclassic.porn","alldeepfake.ink","alldownplay.xyz","allotech-dz.com","allpornflix.com","allpussynow.com","alltechnerd.com","allucanheat.com","amazon-love.com","amritadrino.com","anallievent.com","androidapks.biz","androidsite.net","anime-sanka.com","anime7.download","animedao.com.ru","animenew.com.br","animesexbar.com","animesultra.net","animexxxsex.com","antenasports.ru","aoashimanga.com","apfelpatient.de","apkmagic.com.ar","app.blubank.com","arabshentai.com","arcadepunks.com","archivebate.com","archiwumalle.pl","argio-logic.net","argusleader.com","arstechnica.com","asia.5ivttv.vip","asiangaysex.net","asianhdplay.net","askcerebrum.com","astrumscans.xyz","atemporal.cloud","atleticalive.it","atresplayer.com","au-di-tions.com","auto-service.de","autoindustry.ro","automat.systems","automothink.com","autoshieldd.com","avoiderrors.com","awdescargas.com","babesaround.com","babesinporn.com","babesxworld.com","badgehungry.com","bangpremier.com","baylorbears.com","bdsmkingdom.xyz","bdsmporntub.com","bdsmwaytube.com","beammeup.com.au","bedavahesap.org","beingmelody.com","bellezashot.com","bengalisite.com","bengalxpress.in","bentasker.co.uk","best-shopme.com","best18teens.com","bestensuree.com","bestialporn.com","bestjavporn.com","beurettekeh.com","bg-gledai.video","bgmateriali.com","bgsufalcons.com","bibliopanda.com","big12sports.com","bigboobs.com.es","bigtitslust.com","bike-magazin.de","bike-urious.com","bikeperfect.com","bintangplus.com","biologianet.com","bizjournals.com","blackavelic.com","blackpornhq.com","blacksexmix.com","blogenginee.com","blogpascher.com","blowxxxtube.com","bluebuddies.com","bluedrake42.com","bluemanhoop.com","bluemediafile.*","bluemedialink.*","bluemediaurls.*","bokepsin.in.net","bolly4umovies.*","boobs-mania.com","boobsforfun.com","bookpraiser.com","boosterx.stream","boxingstream.me","boxingvideo.org","boyfriendtv.com","braziliannr.com","bresciatoday.it","brieffreunde.de","brother-usa.com","buffsports.io>>","buffstreamz.com","buickforums.com","bulbagarden.net","bunkr-albums.io","burningseries.*","burytimes.co.uk","buzzheavier.com","caminteresse.fr","camwhoreshd.com","camwhorespy.com","camwhorez.video","captionpost.com","carbonite.co.za","casutalaurei.ro","cataniatoday.it","catchthrust.net","celticway.co.uk","cempakajaya.com","cerberusapp.com","chatropolis.com","cheatglobal.com","check-imei.info","cheese-cake.net","cherrynudes.com","chromeready.com","cieonline.co.uk","cinemablend.com","cinemakottaga.*","citibank.com.sg","ciudadgamer.com","claimclicks.com","classicoder.com","classifarms.com","cloud9obits.com","cloudnestra.com","code-source.net","codeitworld.com","codemystery.com","codeproject.com","coloringpage.eu","comicsporno.xxx","comoinstalar.me","compucalitv.com","computerbild.de","consoleroms.com","coromon.wiki.gg","cosplaynsfw.xyz","cpomagazine.com","cracking-dz.com","crackthemes.com","crazyashwin.com","crazydeals.live","crunchyroll.com","crunchytech.net","cryptoearns.com","cta-fansite.com","cubbiescrib.com","cumshotlist.com","cutiecomics.com","cybertechng.com","cyclingnews.com","cycraracing.com","daemonanime.net","daily-times.com","dailyangels.com","dailybreeze.com","dailycaller.com","dailycamera.com","dailyecho.co.uk","dailyknicks.com","dailymail.co.uk","dailymotion.com","dailypost.co.uk","dailyrecord.com","dailystar.co.uk","dark-gaming.com","dawindycity.com","db-creation.net","dbupatriots.com","dbupatriots.org","decomaniacos.es","definitions.net","delmarvanow.com","desbloqueador.*","descargas2020.*","desirenovel.com","desixxxtube.org","detikbangka.com","detroitnews.com","deutschsex.mobi","devonlife.co.uk","dhankasamaj.com","digiztechno.com","diminimalis.com","direct-cloud.me","dirtybadger.com","discoveryplus.*","diversanews.com","dlouha-videa.cz","dobleaccion.xyz","docs.google.com","dogfight360.com","dollarindex.org","domainwheel.com","donnaglamour.it","donnerwetter.de","dopomininfo.com","dota2freaks.com","dotadostube.com","drake-scans.com","drakerelays.org","drama-online.tv","dramanice.video","dreamcheeky.com","drinksmixer.com","driveplayer.net","droidmirror.com","dtbps3games.com","duplex-full.lol","eaglesnovel.com","easylinkref.com","ebaticalfel.com","echo-news.co.uk","editorsadda.com","edmontonsun.com","edumailfree.com","eksporimpor.com","elektrikmen.com","elpasotimes.com","elperiodico.com","embed.acast.com","embed.meomeo.pw","embedcanais.com","embedplayer.xyz","embedsports.top","embedstreams.me","emperorscan.com","empire-stream.*","engstreams.shop","enryucomics.com","erotikclub35.pw","esportsmonk.com","esportsnext.com","exactpay.online","exam-results.in","explorecams.com","explorosity.net","exporntoons.net","exposestrat.com","extratorrents.*","fabioambrosi.it","fapfapgames.com","farmeramania.de","faselhd-watch.*","fastcompany.com","faucetbravo.fun","fayobserver.com","fcportables.com","fdlreporter.com","fellowsfilm.com","femdomworld.com","femjoybabes.com","feral-heart.com","fidlarmusic.com","file-upload.net","file-upload.org","file.gocmod.com","filecrate.store","filehost9.com>>","filespayout.com","filmesonlinex.*","filmoviplex.com","filmy4wap.co.in","filmyzilla5.com","finalnews24.com","financebolo.com","financemonk.net","financeyogi.net","findnewjobz.com","fingerprint.com","firestream.site","firmenwissen.de","fitnesstipz.com","fitpractise.com","flashsports.org","flordeloto.site","flyanimes.cloud","flygbussarna.se","flywareagle.com","folgenporno.com","footyhunter.lol","forex-yours.com","fourfourtwo.com","foxseotools.com","freebitcoin.win","freebnbcoin.com","freecardano.com","freecourse.tech","freegames44.com","freemockups.org","freeomovie.info","freepornjpg.com","freepornsex.net","freethemesy.com","freevpshere.com","freewebcart.com","french-stream.*","ftsefutures.org","fuckedporno.com","fullxxxporn.net","fztvseries.live","g-streaming.com","gadgetspidy.com","gadzetomania.pl","gainesville.com","game.digitap.eu","gamecopyworld.*","gameplayneo.com","gamersglobal.de","games.macon.com","games.word.tips","gamesaktuell.de","gamestorrents.*","gaminginfos.com","gamingvital.com","gartendialog.de","gayboystube.top","gaypornhdfree.*","gaypornlove.net","gaypornwave.com","gayvidsclub.com","gazetaprawna.pl","geiriadur.ac.uk","geissblog.koeln","gendatabase.com","georgiadogs.com","gesund-vital.de","getexploits.com","gewinnspiele.tv","gfx-station.com","girlssexxxx.com","givemeaporn.com","givemesport.com","glavmatures.com","globaldjmix.com","go.babylinks.in","gocreighton.com","goexplorers.com","gofetishsex.com","gofile.download","gogoanime.co.in","goislanders.com","gokushiteki.com","golderotica.com","golfchannel.com","golfmonthly.com","gomacsports.com","gomarquette.com","gopsusports.com","gosanangelo.com","goxxxvideos.com","goyoungporn.com","gradehgplus.com","grandmatube.pro","grannyfucko.com","grasshopper.com","greattopten.com","grootnovels.com","gsmfirmware.net","gsmfreezone.com","gsmmessages.com","guidetechly.com","guitarworld.com","gut-erklaert.de","hacksnation.com","halohangout.com","handypornos.net","hanimesubth.com","hardcoreluv.com","hardwareluxx.de","hardxxxmoms.com","harshfaucet.com","hd-analporn.com","hd-easyporn.com","hdjavonline.com","hds-streaming.*","healthfatal.com","heavyfetish.com","heidelberg24.de","helicomicro.com","hentai-moon.com","hentai-senpai.*","hentai2read.com","hentaiarena.com","hentaibatch.com","hentaibooty.com","hentaicloud.com","hentaicovid.org","hentaifreak.org","hentaigames.app","hentaihaven.com","hentaihaven.red","hentaihaven.vip","hentaihaven.xxx","hentaiocean.com","hentaiporno.xxx","hentaipulse.com","hentaitube1.lol","heroine-xxx.com","hesgoal-live.io","hiddencamhd.com","hogtiehub.com>>","hokiesports.com","hollymoviehd.cc","hollywoodpq.com","hookupnovel.com","hostserverz.com","hot-cartoon.com","hotgameplus.com","hotmediahub.com","hotpornfile.org","hotsexstory.xyz","hotstunners.com","hotxxxpussy.com","hqxxxmovies.com","hscprojects.com","huntspost.co.uk","iban-rechner.de","ibcomputing.com","ibeconomist.com","ideal-teens.com","idealhome.co.uk","ikramlar.online","ilbassoadige.it","ilgazzettino.it","illicoporno.com","ilmessaggero.it","ilsole24ore.com","imagelovers.com","imgqnnnebrf.sbs","incgrepacks.com","indiakablog.com","infrafandub.com","inside-handy.de","instabiosai.com","insuredhome.org","interracial.com","inyatrust.co.in","iptvjournal.com","irvinetimes.com","italianoxxx.com","itsonsitetv.com","iwantmature.com","januflix.expert","japangaysex.com","japansporno.com","japanxxxass.com","jastrzabpost.pl","javcensored.net","javenglish.cc>>","javindosub.site","javmoviexxx.com","javpornfull.com","javraveclub.com","javteentube.com","javtrailers.com","jaysjournal.com","jetztspielen.de","jmcomic-zzz.org","jnvharidwar.org","jobslampung.net","jokerscores.com","jollibee.com.vn","kabarportal.com","karaoketexty.cz","kasvekuvvet.net","katmoviehd4.com","kattannonser.se","kawarthanow.com","keezmovies.surf","kent-life.co.uk","ketoconnect.net","ketubanjiwa.com","kickass-anime.*","kickassanime.ch","kiddyearner.com","kingsleynyc.com","kisshentaiz.com","kitabmarkaz.xyz","kitapsan.com.tr","kittycatcam.com","kodewebsite.com","komikdewasa.art","komorkomania.pl","krakenfiles.com","kreiszeitung.de","krktcountry.com","kstorymedia.com","kurierverlag.de","kyoto-kanko.net","la123movies.org","langitmovie.com","laptechinfo.com","latinluchas.com","lavozdigital.es","leakgallery.com","learnedclub.com","lecrabeinfo.net","legionscans.com","lendrive.web.id","lesbiansex.best","levante-emv.com","libertycity.net","librasol.com.br","liga3-online.de","lightsnovel.com","link.3dmili.com","link.asiaon.top","link.cgtips.org","link.codevn.net","linksheild.site","linkvertise.com","linux-talks.com","live.arynews.tv","livescience.com","livesport24.net","livestreames.us","livestreamtv.pk","livexscores.com","livingathome.de","livornotoday.it","lombardiave.com","lookmoviess.com","looptorrent.org","lotusgamehd.xyz","loudersound.com","lovelynudez.com","lovingsiren.com","luchaonline.com","lucrebem.com.br","lukesitturn.com","lulustream.live","lustesthd.cloud","lycee-maroc.com","lyrics-jpop.net","macombdaily.com","macrotrends.net","magdownload.org","maisonbrico.com","mangahentai.xyz","mangahere.today","mangakakalot.gg","mangaonline.fun","mangaraw1001.cc","mangarawjp.asia","mangarussia.com","manhuarmmtl.com","manhwahentai.me","manoramamax.com","mantrazscan.com","marie-claire.es","marieclaire.com","marimo-info.net","marketmovers.it","maskinbladet.dk","mastakongo.info","mathsstudio.com","mathstutor.life","maxcheaters.com","maxjizztube.com","maxstream.video","maxtubeporn.net","me-encantas.com","medeberiya.site","medeberiya1.com","medeberiyaa.com","medeberiyas.com","medeberiyax.com","mediacast.click","mega4upload.com","mega4upload.net","mejortorrento.*","mejortorrents.*","mejortorrentt.*","memoriadatv.com","mensfitness.com","mensjournal.com","mentalfloss.com","mercerbears.com","mercurynews.com","messinatoday.it","metal-hammer.de","miiiiixdrop.net","milliyet.com.tr","miniminiplus.pl","minutolivre.com","mixrootmods.com","mmsmasala27.com","mobility.com.ng","modelviewer.lol","modporntube.com","moflix-stream.*","molbiotools.com","mommy-pussy.com","momtubeporn.xxx","motherporno.com","mov18plus.cloud","moviemaniak.com","movierulzfree.*","movierulzlink.*","movies2watch.tv","moviescounter.*","moviesonline.fm","moviessources.*","moviessquad.com","movieuniverse.*","mp3fromyou.tube","mrdeepfakes.com","mscdroidlabs.es","msdos-games.com","msonglyrics.com","msuspartans.com","muchohentai.com","multifaucet.org","musiclutter.xyz","musikexpress.de","myanimelist.net","mybestxtube.com","mydesiboobs.com","myfreeblack.com","mysexybabes.com","mywatchseries.*","myyoungbabe.com","mzansinudes.com","naijanowell.com","naijaray.com.ng","nakedbabes.club","nangiphotos.com","nativesurge.net","nativesurge.top","naughtyza.co.za","nbareplayhd.com","nbcolympics.com","necksdesign.com","needgayporn.com","nekopoicare.*>>","networkhint.com","news-herald.com","news-leader.com","newstechone.com","nflspinzone.com","nicexxxtube.com","nissanzclub.com","nizarstream.com","noindexscan.com","noithatmyphu.vn","nokiahacking.pl","northjersey.com","nosteamgames.ro","notebookcheck.*","notesformsc.org","noteshacker.com","notunmovie.link","novelssites.com","nsbtmemoir.site","nsfwmonster.com","nsfwyoutube.com","nswdownload.com","nu6i-bg-net.com","nudeslegion.com","nudismteens.com","nukedpacks.site","nullscripts.net","nursexfilme.com","nyaatorrent.com","oceanofmovies.*","okiemrolnika.pl","olympustaff.com","omgexploits.com","online-smss.com","onlinekosten.de","open3dmodel.com","openculture.com","openloading.com","order-order.com","orgasmatrix.com","oromedicine.com","otokukensaku.jp","otomi-games.com","ourcoincash.xyz","oyundunyasi.net","ozulscansen.com","pacersports.com","pageflutter.com","pakkotoisto.com","palermotoday.it","panda-novel.com","pandamovies.org","pandasnovel.com","paperzonevn.com","paste4free.site","pawastreams.org","pawastreams.pro","pcgameszone.com","pdftoshokan.com","peliculas8k.com","peliculasmx.net","pelisflix20.*>>","pelismarthd.com","pelisxporno.net","pendekarsubs.us","pepperlive.info","perfektdamen.co","persianhive.com","perugiatoday.it","pewresearch.org","pflege-info.net","phillyburbs.com","phonerotica.com","pianetalecce.it","pics4upload.com","picxnkjkhdf.sbs","pimpandhost.com","pinoyalbums.com","pinoyrecipe.net","piratehaven.xyz","pisshamster.com","pixdfdjkkr.shop","pixkfjtrkf.shop","planetfools.com","platinporno.com","play.hbomax.com","player.msmini.*","plugincrack.com","pocket-lint.com","pokemonhubs.com","polenjournal.de","popcornstream.*","porhubvideo.com","porn-monkey.com","pornexpanse.com","pornfactors.com","porngameshd.com","pornhegemon.com","pornhoarder.net","porninblack.com","porno-porno.net","porno-rolik.com","pornohammer.com","pornohirsch.net","pornoklinge.com","pornomanoir.com","pornrusskoe.com","portable4pc.com","powergam.online","premiumporn.org","privatemoviez.*","projectfreetv.*","promimedien.com","proxydocker.com","punishworld.com","purelyceleb.com","pussy3dporn.com","pussyhothub.com","qatarstreams.me","quiltfusion.com","quotesshine.com","r1.richtoon.top","rackusreads.com","radionatale.com","radionylive.com","radiorockon.com","railwebcams.net","rajssoid.online","ramdomlives.com","rangerboard.com","rapidkil.com.au","ravennatoday.it","rctechsworld.in","readhunters.xyz","readingpage.fun","redpornblog.com","remodelista.com","rennrad-news.de","renoconcrete.ca","rentbyowner.com","reportera.co.kr","restegourmet.de","retroporn.world","risingapple.com","ritacandida.com","roaringapps.com","robot-forum.com","rojadirectatv.*","rollingstone.de","romaierioggi.it","romfirmware.com","root-nation.com","route-fifty.com","rule34vault.com","rule34video.com","runnersworld.de","rushuploads.com","ryansharich.com","saabcentral.com","salernotoday.it","samapkstore.com","sampledrive.org","samuraiscan.org","santhoshrcf.com","savanaforum.com","savannahnow.com","savealoonie.com","saxontheweb.net","scan-hentai.net","scatnetwork.com","schwaebische.de","scr950forum.com","sdmoviespoint.*","seadoospark.org","sekaikomik.live","seltosforum.com","serienstream.to","seriesmetro.net","serverbd247.com","serviceemmc.com","setfucktube.com","sex-torrent.net","sexanimesex.com","sexoverdose.com","sexseeimage.com","sexwebvideo.com","sexxxanimal.com","sexy-parade.com","sexyerotica.net","seznamzpravy.cz","sfmcompile.club","shadagetech.com","shadowrangers.*","sharegdrive.com","sharinghubs.com","shemalegape.net","shopkensaku.com","short-jambo.ink","showcamrips.com","showrovblog.com","shrugemojis.com","shugraithou.com","siamfishing.com","sieutamphim.org","singingdalong.*","siriusfiles.com","sitetorrent.com","sivackidrum.net","skyroadster.com","slapthesign.com","slateforums.com","sleazedepot.com","sleazyneasy.com","smartcharts.net","smokinvette.com","sms-anonyme.net","sms-receive.net","smsonline.cloud","smumustangs.com","soconsports.com","software-on.com","softwaresde.com","solarchaine.com","sommerporno.com","sondriotoday.it","souq-design.com","sourceforge.net","spanishdict.com","spardhanews.com","sport890.com.uy","sports-stream.*","sportsblend.net","sportsonline.si","sportsonline.so","sportsplays.com","sportsseoul.com","sportstiger.com","sportstreamtv.*","ssdhostting.com","starcourier.com","stargazette.com","starstreams.pro","start-to-run.be","staugustine.com","stdrivers.co.uk","sterkinekor.com","stream.bunkr.ru","streamnoads.com","streampass.shop","stripers247.com","stronakobiet.pl","studybullet.com","subtitlecat.com","sueddeutsche.de","sulasokvids.net","sullacollina.it","sumirekeiba.com","suneelkevat.com","superdeporte.es","superembeds.com","supermarches.ca","supermovies.org","supraforums.com","surf-magazin.de","svethardware.cz","swift4claim.com","syracusefan.com","tabooanime.club","tagesspiegel.de","tallahassee.com","tamilanzone.com","tamilultra.team","tapeantiads.com","tapeblocker.com","taycanforum.com","techacrobat.com","techadvisor.com","techastuces.com","techedubyte.com","techinferno.com","technichero.com","technorozen.com","techoreview.com","techprakash.com","techsbucket.com","techyhigher.com","techymedies.com","tedenglish.site","teen-hd-sex.com","teenfucksex.com","teenpornjpg.com","teensextube.xxx","teenxxxporn.pro","telegraph.co.uk","telepisodes.org","temporeale.info","tenbaiquest.com","tenies-online.*","tennisonline.me","tennisstreams.*","teracourses.com","texassports.com","textreverse.com","thaiairways.com","the-mystery.org","the2seasons.com","theappstore.org","thebarchive.com","thebigblogs.com","theclashify.com","thedilyblog.com","thegrowthop.com","thejetpress.com","thejoblives.com","themoviesflix.*","thenewsstar.com","theprovince.com","thereporter.com","thespectrum.com","thestreameast.*","theterrace.scot","thetoneking.com","thetowntalk.com","theusaposts.com","thewebflash.com","theyarehuge.com","thingiverse.com","thingstomen.com","thisisrussia.io","thueringen24.de","thumpertalk.com","ticketmaster.sg","tickhosting.com","ticonsiglio.com","tieba.baidu.com","tienganhedu.com","timesonline.com","tires.costco.ca","today-obits.com","todopolicia.com","toeflgratis.com","tokuzilla.net>>","tokyomotion.com","tokyomotion.net","tophostdeal.com","topnewsshow.com","topperpoint.com","topstarnews.net","torascripts.org","tornadomovies.*","torrentgalaxy.*","torrentgame.org","torrentstatus.*","torresette.news","tour-magazin.de","tradingview.com","transfermarkt.*","trendohunts.com","trevisotoday.it","triesteprima.it","true-gaming.net","truyenhentaiz.*","trytutorial.com","tubegaytube.com","tubepornnow.com","tudongnghia.com","tuktukcinma.com","turbovidhls.com","turkeymenus.com","turystyka.wp.pl","tusachmanga.com","tvanouvelles.ca","tvsportslive.fr","twistedporn.com","twitchnosub.com","tyler-brown.com","u6lyxl0w.skin>>","ukathletics.com","ultramovies.org","undeniable.info","underhentai.net","unipanthers.com","updateroj24.com","uploadbeast.com","uploadcloud.pro","uppercutmma.com","user.guancha.cn","vectogravic.com","veekyforums.com","vegamovies3.org","veneziatoday.it","vfxdownload.net","vicenzatoday.it","viciante.com.br","vidcloudpng.com","video.genyt.net","videodidixx.com","videosputas.xxx","vidsrc-embed.ru","vik1ngfile.site","ville-ideale.fr","viralharami.com","viralxvideos.es","virtuavixen.com","voyageforum.com","vtplayer.online","wantedbabes.com","warmteensex.com","watch-my-gf.com","watch.sling.com","watchf1full.com","watchfreexxx.pw","watchhentai.net","watchmovieshd.*","watchporn4k.com","watchpornfree.*","watchseries8.to","watchserieshd.*","watchtvseries.*","watchxxxfree.pw","wealthcatal.com","weatherzone.com","web.epalovo.com","webmatrices.com","webtoonscan.com","wegotcookies.co","weltfussball.at","wemakesites.net","whattowatch.com","wheelofgold.com","wholenotism.com","wholevideos.com","whowhatwear.com","wieistmeineip.*","wikipooster.com","windowslite.net","windsorstar.com","winnipegsun.com","witcherhour.com","womenshealth.de","world-iptv.club","worldgyan18.com","worldofiptv.com","worldsports.*>>","wowpornlist.xyz","wowyoungsex.com","wpgdadatong.com","wristreview.com","writeprofit.org","wvv-fmovies.com","www.youtube.com","xfuckonline.com","xhardhempus.net","xianzhenyuan.cn","xiaomitools.com","xkeezmovies.com","xmoviesforyou.*","xn--31byd1i.net","xnudevideos.com","xnxxhamster.net","xterraforum.com","xxxindianporn.*","xxxparodyhd.net","xxxpornmilf.com","xxxtubegain.com","xxxtubenote.com","xxxtubepass.com","xxxwebdlxxx.top","yairalon.com.br","yanksgoyard.com","yazilidayim.net","yesmovies123.me","yeutienganh.com","yogablogfit.com","yomoviesnow.com","yorkpress.co.uk","youlikeboys.com","youmedemblik.nl","young-pussy.com","youranshare.com","yourporngod.com","youtubekids.com","yrtourguide.com","ytconverter.app","yuramanga.my.id","zeroradio.co.uk","zonavideosx.com","zone-annuaire.*","zoominar.online","007stockchat.com","123movies-free.*","18-teen-porn.com","18-teen-tube.com","18adultgames.com","18comic-gquu.vip","1movielinkbd.com","1movierulzhd.pro","24pornvideos.com","2kspecialist.net","4fingermusic.com","8-ball-magic.com","9now.nine.com.au","aberdeennews.com","about-drinks.com","account.bhvr.com","activevoyeur.com","activistpost.com","actresstoday.com","adblockstrtape.*","adblockstrtech.*","adonisfansub.com","adult-empire.com","adultporn.com.es","advertafrica.net","agedtubeporn.com","aghasolution.com","ajaxshowtime.com","ajkalerbarta.com","alleveilingen.be","alleveilingen.nl","alliptvlinks.com","allporncomic.com","alphagames4u.com","alphapolis.co.jp","alphasource.site","altselection.com","anakteknik.co.id","analsexstars.com","analxxxvideo.com","androidadult.com","androidfacil.org","androidgreek.com","androidspill.com","anime-odcinki.pl","animesexclip.com","animetwixtor.com","animixstream.com","antennasports.ru","aopathletics.org","apkandroidhub.in","app.khaddavi.net","app.simracing.gp","applediagram.com","aquariumgays.com","arezzonotizie.it","articlesmania.me","ashleyhardat.com","asianimage.co.uk","asianmassage.xyz","asianpornjav.com","assettoworld.com","asyaanimeleri.pw","athlonsports.com","atlantisscan.com","auburntigers.com","audiofanzine.com","audycje.tokfm.pl","autotrader.co.uk","avellinotoday.it","axutongxue.space","azby.fmworld.net","baby-vornamen.de","backfirstwo.site","backyardboss.net","bangyourwife.com","barrheadnews.com","barrier-free.net","base64decode.org","bcuathletics.com","beaddiagrams.com","beritabangka.com","berlin-teltow.de","bestasiansex.pro","bestblackgay.com","bestcash2020.com","bestgamehack.top","bestgrannies.com","besthdmovies.com","bestpornflix.com","bestsextoons.com","beta.plus.rtl.de","biblegateway.com","bigbuttshub2.top","bikeportland.org","birdswatcher.com","bisceglielive.it","bitchesgirls.com","blackandteal.com","blog.livedoor.jp","blowjobfucks.com","bloxinformer.com","bloxyscripts.com","bluemediafiles.*","bluerabbitrx.com","blueridgenow.com","bmw-scooters.com","boerse-online.de","bollywoodfilma.*","bondagevalley.cc","book.trivago.com","booksbybunny.com","boolwowgirls.com","boote-magazin.de","bootstrample.com","bostonherald.com","boysxclusive.com","brandbrief.co.kr","bravoerotica.com","bravoerotica.net","breatheheavy.com","breedingmoms.com","buffalowdown.com","businesstrend.jp","butlersports.com","butterpolish.com","bysedikamoum.com","bysesayeveum.com","caesarjaco.co.id","call2friends.com","cambstimes.co.uk","caminspector.net","campusfrance.org","camvideoshub.com","camwhoresbay.com","caneswarning.com","capecodtimes.com","cartoonporno.xxx","catmovie.website","ccnworldtech.com","celtadigital.com","championdrive.co","charexempire.com","chattanoogan.com","cheatography.com","chelsea24news.pl","chieflyoffer.com","choiceofmods.com","chubbyelders.com","cizzyscripts.com","claimsatoshi.xyz","clever-tanken.de","clickforhire.com","clickndownload.*","clipconverter.cc","cloudgallery.net","cmumavericks.com","coin-profits.xyz","collegehdsex.com","colliersnews.com","coloredmanga.com","comeletspray.com","cometogliere.com","comicspornos.com","comicspornow.com","comicsvalley.com","computerpedia.in","convert2mp3.club","convertinmp4.com","courierpress.com","courseleader.net","cr7-soccer.store","cracksports.me>>","creativebloq.com","criptologico.com","cryptoclicks.net","cryptofaucet.xyz","cryptojunkie.net","cryptomonitor.in","culturequizz.com","cybercityhelp.in","cyberstumble.com","cydiasources.net","dailyboulder.com","dailypudding.com","dailytips247.com","dailyuploads.net","dakotaforums.com","darknessporn.com","darkwanderer.net","dasgelbeblatt.de","dataunlocker.com","dattebayo-br.com","davewigstone.com","dayoftheweek.org","daytonflyers.com","ddl-francais.com","deepfakeporn.net","deepswapnude.com","demonicscans.org","designparty.sx>>","desikamababa.com","diariodeibiza.es","dirtytubemix.com","discoveryplus.in","doanhnghiepvn.vn","dobrapogoda24.pl","dobreprogramy.pl","donghuaworld.com","dorsetecho.co.uk","downloadapk.info","downloadbatch.me","downloadsite.org","downloadsoft.net","dpscomputing.com","dryscalpgone.com","dualshockers.com","dudleynews.co.uk","duplichecker.com","dvdgayonline.com","earncrypto.co.in","eartheclipse.com","eastbaytimes.com","easymilftube.net","ebook-hunter.org","ecom.wixapps.net","edufileshare.com","einfachschoen.me","eleceedmanhwa.me","eletronicabr.com","elevationmap.net","eliobenedetto.it","embedseek.online","embedstreams.top","empire-anime.com","emulatorsite.com","english101.co.za","eslauthority.com","esportstales.com","everysextube.com","ewrc-results.com","exclusivomen.com","explorersweb.com","fallbrook247.com","familyporner.com","famousnipple.com","fastdownload.top","fattelodasolo.it","fatwhitebutt.com","faucetcrypto.com","faucetcrypto.net","favefreeporn.com","favoyeurtube.net","femmeactuelle.fr","fernsehserien.de","fetishshrine.com","filecatchers.com","filespayouts.com","filmyhitlink.xyz","filmyhitt.com.in","financacerta.com","financeehelp.com","financeguidz.com","fineasiansex.com","finofilipino.org","fitnessholic.net","fitnessscenz.com","flatpanelshd.com","floridatoday.com","foodieteller.com","footwearnews.com","footymercato.com","foreverquote.xyz","forexcracked.com","forextrader.site","forgepattern.net","forum-xiaomi.com","foxsports.com.au","freegetcoins.com","freehardcore.com","freehdvideos.xxx","freelitecoin.vip","freemomstube.com","freemoviesu4.com","freeporncave.com","freevstplugins.*","freshersgold.com","fullxxxmovies.me","fumettologica.it","fussballdaten.de","gadgetxplore.com","gadsdentimes.com","game-repack.site","gamemodsbase.com","gamers-haven.org","games.boston.com","games.kansas.com","games.modbee.com","games.puzzles.ca","games.sacbee.com","games.sltrib.com","games.usnews.com","gamesrepacks.com","gamingbeasts.com","gamingdeputy.com","gaminglariat.com","ganstamovies.com","gartenlexikon.de","gaydelicious.com","gazetalubuska.pl","gbmwolverine.com","gdrivelatino.net","gdrivemovies.xyz","gemiadamlari.org","genialetricks.de","gentlewasher.com","getdatgadget.com","getdogecoins.com","getfreegames.net","getworkation.com","gezegenforum.com","ghettopearls.com","ghostsfreaks.com","gidplayer.online","gigemgazette.com","globelempire.com","go.discovery.com","go.gociwidey.com","go.shortnest.com","goblackbears.com","godstoryinfo.com","goetbutigers.com","gogetadoslinks.*","gomcpanthers.com","gometrostate.com","goodyoungsex.com","gophersports.com","gopornindian.com","greasygaming.com","greenarrowtv.com","gruene-zitate.de","gruporafa.com.br","gsm-solution.com","gtamaxprofit.com","guitarplayer.com","guncelkaynak.com","gutesexfilme.com","hadakanonude.com","haiwaishubao.com","handelsblatt.com","hard-tubesex.com","hardfacefuck.com","harpersbazaar.fr","hausbau-forum.de","hayatarehber.com","hd-tube-porn.com","healthylifez.com","heilpraxisnet.de","hentaicomics.pro","hentaiseason.com","hentaistream.com","hentaivideos.net","hometalkpaid.com","hotcopper.com.au","hotdreamsxxx.com","hotpornyoung.com","hotpussyhubs.com","houstonpress.com","hqpornstream.com","huskercorner.com","id.condenast.com","idmextension.xyz","ignoustudhelp.in","ikindlebooks.com","imagereviser.com","imageshimage.com","imagetotext.info","imperiofilmes.co","inprogrammer.com","intellischool.id","interviewgig.com","investorveda.com","isekaibrasil.com","isekaipalace.com","jacksonville.com","jalshamoviezhd.*","japaneseasmr.com","japanesefuck.com","japanfuck.com.es","javenspanish.com","javfullmovie.com","joinusonline.net","journalduweb.org","justblogbaby.com","justswallows.net","kakarotfoot.ru>>","katiescucina.com","kawaii-anime.com","kayifamilytv.com","khatrimazafull.*","kingdomfiles.com","kingstreamz.site","kireicosplay.com","kitchennovel.com","kitraskimisi.com","knowyourmeme.com","kodibeginner.com","kokosovoulje.com","komikstation.com","komputerswiat.pl","kshowsubindo.org","kstatesports.com","ksuathletics.com","kurakura21.space","kuttymovies1.com","lakeshowlife.com","lampungkerja.com","larvelfaucet.com","lascelebrite.com","latesthdmovies.*","latinohentai.com","lavanguardia.com","lawyercontact.us","leaderlive.co.uk","league-funny.com","lectormangaa.com","leechpremium.net","legionjuegos.org","lehighsports.com","lesbiantube.club","letmewatchthis.*","levelupalone.com","lg-firmwares.com","libramemoria.com","lifesurance.info","lightxxxtube.com","limetorrents.lol","linkneverdie.net","linux-magazin.de","linuxexplain.com","live.vodafone.de","livenewsflix.com","lk21official.*>>","logofootball.net","london-now.co.uk","lookmovie.studio","loudountimes.com","ltpcalculator.in","luminatedata.com","lumpiastudio.com","lustaufsleben.at","m.biqiugege8.com","macrocreator.com","magicseaweed.com","mahobeachcam.com","mammaebambini.it","manga-scantrad.*","mangacanblog.com","mangaforfree.com","mangaindo.web.id","mangakuri.online","masstamilans.com","mastaklomods.com","masterplayer.xyz","matshortener.xyz","mature-tube.sexy","maxisciences.com","mebelinovdom.com","meconomynews.com","mee-cccdoz45.com","meetdownload.com","megafilmeshd20.*","megajapansex.com","mejortorrents1.*","merlinshoujo.com","meteoetradar.com","metin2alerts.com","milanreports.com","milfxxxpussy.com","milkporntube.com","misterdonghua.in","mlookalporno.com","mockupgratis.com","mockupplanet.com","moto-station.com","mountaineast.org","movielinkhub.xyz","movierulz2free.*","movierulzwatch.*","movieshdwatch.to","movieshubweb.com","moviesnipipay.me","moviesrulzfree.*","moviestowatch.tv","mrproblogger.com","msmorristown.com","msumavericks.com","multimovies.tech","musiker-board.de","my-ford-focus.de","myair.resmed.com","mycivillinks.com","mydownloadtube.*","myfitnesspal.com","mylegalporno.com","mylivestream.pro","mymotherlode.com","mypapercraft.net","myproplugins.com","myradioonline.pl","nakedbbw-sex.com","namethatporn.com","naruldonghua.com","nationalpost.com","nativesurge.info","nauathletics.com","naughtyblogs.xyz","ncbi.nlm.nih.gov","neatfreeporn.com","neatpornodot.com","netflixporno.net","netizensbuzz.com","newanimeporn.com","newsinlevels.com","newsobserver.com","newstvonline.com","nghetruyenma.net","nguyenvanbao.com","nhentaihaven.org","niftyfutures.org","nintendolife.com","nl.hardware.info","nocsummer.com.br","nontonhentai.net","norfolkmag.co.uk","notebookchat.com","notiziemusica.it","novablogitalia.*","nude-teen-18.com","nudemomshots.com","null-scripts.net","nwfdailynews.com","officecoach24.de","older-mature.net","oldgirlsporn.com","onestringlab.com","onlineathens.com","onlineporn24.com","onlyfanvideo.com","onlygangbang.com","onlygayvideo.com","onlyindianporn.*","openloadmovies.*","optimizepics.com","oranhightech.com","orenoraresne.com","oswegolakers.com","otakuanimess.net","overtakefans.com","oxfordmail.co.uk","ozbargain.com.au","pagalworld.video","pandaatlanta.com","pandafreegames.*","paradoxscans.com","parentcircle.com","parking-map.info","pdfstandards.net","pedroinnecco.com","penis-bilder.com","personefamose.it","petoskeynews.com","phinphanatic.com","physics101.co.za","pigeonburger.xyz","pilotsglobal.com","pinsexygirls.com","play.history.com","playarcady.com>>","player.gayfor.us","player.hboav.com","player.hdgay.net","player.pop.co.uk","player4me.online","playsexgames.xxx","pleasuregirl.net","plumperstube.com","plumpxxxtube.com","poconorecord.com","pokeca-chart.com","police.community","ponselharian.com","porn-hd-tube.com","pornclassic.tube","pornclipshub.com","pornforrelax.com","porngayclips.com","pornhub-teen.com","pornobengala.com","pornoborshch.com","pornoteensex.com","pornsex-pics.com","pornstargold.com","pornuploaded.net","pornvideotop.com","pornwatchers.com","pornxxxplace.com","pornxxxxtube.net","portnywebcam.com","postcrescent.com","postermockup.com","powerover.site>>","practicequiz.com","prajwaldesai.com","praveeneditz.com","printedwaste.com","privatenudes.com","programme-tv.net","prosiebenmaxx.de","purduesports.com","purposegames.com","puzzles.nola.com","pythonjobshq.com","qrcodemonkey.net","rabbitstream.net","realityblurb.com","realjapansex.com","receptyonline.cz","recordonline.com","redbirdrants.com","rendimentibtp.it","repack-games.com","reportbangla.com","reporternews.com","ribbelmonster.de","rimworldbase.com","ringsidenews.com","ripplestream4u.*","rivianforums.com","riwayat-word.com","rocketrevise.com","rollingstone.com","royale-games.com","rule34hentai.net","rv-ecommerce.com","s1000rrforum.com","sabishiidesu.com","safehomefarm.com","sainsburys.co.uk","saradahentai.com","sarugbymag.co.za","satoshifaucet.io","savethevideo.com","savingadvice.com","schaken-mods.com","schildempire.com","schoolcheats.net","scioniaforum.com","scionimforum.com","scoutevforum.com","search.brave.com","seat-forum.co.uk","seattletimes.com","secretsdujeu.com","segwayforums.com","semuanyabola.com","sensualgirls.org","serial1forum.com","serienjunkies.de","seriesflixhd.*>>","serieslandia.com","sesso-escort.com","sexanimetube.com","sexfilmkiste.com","sexflashgame.org","sexhardtubes.com","sexjapantube.com","sexlargetube.com","sexmomvideos.com","sexontheboat.xyz","sexpornasian.com","sextingforum.net","sexybabesart.com","sexyoungtube.com","sharelink-1.site","sheepesports.com","shelovesporn.com","shemalemovies.us","shemalepower.xyz","shemalestube.com","shercoforums.com","shimauma-log.com","shoot-yalla.live","short.croclix.me","shortenlinks.top","shotgunworld.com","showbizbites.com","shrinkforearn.in","shrinklinker.com","signupgenius.com","sikkenscolore.it","simpleflying.com","simplyvoyage.com","sitesunblocked.*","skidrowcodex.net","skidrowcrack.com","skincaretalk.com","skintagsgone.com","smallseotools.ai","smart-wohnen.net","smartermuver.com","smartevforum.com","smashyplayer.top","sniperforums.com","soccershoes.blog","softdevelopp.com","softwaresite.net","solution-hub.com","sonataforums.com","soonersports.com","soundpark-club.*","southpark.cc.com","soyoungteens.com","space-faucet.com","specialstage.com","spigotunlocked.*","splinternews.com","sportpiacenza.it","sports.yahoo.com","sportshub.stream","sportsloverz.xyz","sportstream.live","spotifylists.com","ss.randomkzn.com","sshconect.com.br","sssinstagram.com","stablerarena.com","stagatvfiles.com","stalowemiasto.pl","starlinktalk.com","stelvioforum.com","stiflersmoms.com","stileproject.com","stillcurtain.com","stockhideout.com","stopstreamtv.net","storieswatch.com","stream.nflbox.me","stream4free.live","streamblasters.*","streamcenter.xyz","streamextreme.cc","streamingnow.mov","streamingworld.*","streamloverx.com","strefabiznesu.pl","stromerforum.com","stromtrooper.com","strtapeadblock.*","suamusica.com.br","suffolkmag.co.uk","sukidesuost.info","sunshine-live.de","supremebabes.com","sussexlife.co.uk","swiftuploads.com","sxmislandcam.com","synoniemboek.com","tamarindoyam.com","tapelovesads.org","taroot-rangi.com","tatsumi-crew.net","teachmemicro.com","techgeek.digital","techkhulasha.com","techlearning.com","technewslive.org","tecnotutoshd.net","teensexvideos.me","telegratuita.com","tempatwisata.pro","text-compare.com","the1security.com","thecozyapron.com","thecustomrom.com","thefappening.pro","thegadgetking.in","thehiddenbay.com","theinventory.com","thejobsmovie.com","thelandryhat.com","thelosmovies.com","thelovenerds.com","thematurexxx.com","thenational.scot","thenerdstash.com","thenewsdrill.com","thenewsglobe.net","thenextplanet1.*","theorie-musik.de","thepiratebay.org","thepoorcoder.com","thesportster.com","thesportsupa.com","thestarpress.com","thesundevils.com","thetrendverse.in","thevikingage.com","thisisfutbol.com","timesnownews.com","timesofindia.com","tires.costco.com","tiroalpaloes.net","tnstudycorner.in","todays-obits.com","todoandroid.live","tomshardware.com","tonanmedia.my.id","topvideosgay.com","toramemoblog.com","torrentkitty.one","totallyfuzzy.net","toureiffel.paris","towsontigers.com","tptvencore.co.uk","tradersunion.com","travelerdoor.com","trendytalker.com","trogiupnhanh.com","trucosonline.com","truetrophies.com","tube-teen-18.com","tube.shegods.com","tuotromedico.com","turbogvideos.com","turboplayers.xyz","turtleviplay.xyz","tutorialsaya.com","tvtechnology.com","tweakcentral.net","twobluescans.com","typinggames.zone","uconnhuskies.com","unfriend-app.com","unionpayintl.com","uniquestream.net","universegunz.net","unrealengine.com","upfiles-urls.com","upgradedhome.com","upstyledaily.com","urlgalleries.net","uvmathletics.com","uwlathletics.com","vancouversun.com","vandaaginside.nl","vegamoviese.blog","veryfreeporn.com","vichitrainfo.com","videocdnal24.xyz","videosection.com","vikingf1le.us.to","villettt.kitchen","vinstartheme.com","viralvideotube.*","viralxxxporn.com","vivrebordeaux.fr","vodkapr3mium.com","voiranime.stream","voyeur-house.org","voyeurfrance.net","voyeurxxxsex.com","vrporngalaxy.com","vvdailypress.com","vzrosliedamy.com","watchanime.video","watchfreekav.com","watchfreexxx.net","watchmovierulz.*","watchmovies2.com","wbschemenews.com","wearehunger.site","wearevoice.co.uk","web.facebook.com","webcamsdolls.com","webcheats.com.br","webdesigndev.com","webdeyazilim.com","webseriessex.com","websitesball.com","werkzeug-news.de","whentostream.com","whitexxxtube.com","wiadomosci.wp.pl","wildpictures.net","willow.arlen.icu","windowsonarm.org","wolfgame-ar.site","womanandhome.com","womenreality.com","workxvacation.jp","worldhistory.org","worldjournal.com","wrestlinginc.com","wrzesnia.info.pl","wunderground.com","wvuathletics.com","www.amazon.co.jp","www.amazon.co.uk","www.facebook.com","wysokieobcasy.pl","xhamster-art.com","xhamsterporno.mx","xhamsterteen.com","xvideos-full.com","xxxanimefuck.com","xxxlargeporn.com","xxxlesvianas.com","xxxretrofuck.com","xxxteenyporn.com","xxxvideos247.com","yellowbridge.com","yesjavplease.fun","youngerporn.mobi","youtubetoany.com","youtubetowav.net","youwatch.monster","ysokuhou.blog.jp","zdravenportal.eu","zecchino-doro.it","ziggogratis.site","ziminvestors.com","ziontutorial.com","zippyshare.cloud","zwergenstadt.com","123moviesonline.*","123strippoker.com","12thmanrising.com","1337x.unblocked.*","1337x.unblockit.*","19-days-manga.com","1movierulzhd.hair","1teentubeporn.com","2japaneseporn.com","acapellas4u.co.uk","acdriftingpro.com","adblockplustape.*","adffdafdsafds.sbs","alaskananooks.com","alternativeto.net","altyazitube22.lat","amateur-twink.com","amateurfapper.com","amsmotoresllc.com","ancient-origins.*","andhrafriends.com","androidonepro.com","androidpolice.com","animalwebcams.net","anime-torrent.com","animecenterbr.com","animeidhentai.com","animelatinohd.com","animeonline.ninja","animepornfilm.com","animesonlinecc.us","animexxxfilms.com","anonymousemail.me","apostoliclive.com","arabcanadanews.ca","arabshentai.com>>","arcade.lemonde.fr","armypowerinfo.com","asianfucktube.com","asiansexcilps.com","assignmentdon.com","atalantini.online","autoexpress.co.uk","ayradvertiser.com","babyjimaditya.com","badassoftcore.com","badgerofhonor.com","bafoeg-aktuell.de","bandyforbundet.no","banzhu1111111.com","banzhu2222222.com","banzhu3333333.com","banzhu4444444.com","banzhu5555555.com","banzhu6666666.com","banzhu7777777.com","banzhu8888888.com","banzhu9999999.com","bargainbriana.com","beaconjournal.com","beargoggleson.com","bebasbokep.online","beritasulteng.com","bestanime-xxx.com","besthdgayporn.com","besthugecocks.com","bestpussypics.net","beyondtheflag.com","bgmiupdate.com.in","bigdickwishes.com","bigtitsxxxsex.com","black-matures.com","blackhatworld.com","bladesalvador.com","blizzboygames.net","blog.linksfire.co","blog.textpage.xyz","blogcreativos.com","blogtruyenmoi.com","bollywoodchamp.in","bostoncommons.net","bracontece.com.br","bradleybraves.com","brazzersbabes.com","brindisireport.it","brokensilenze.net","browncrossing.net","brushednickel.biz","bryantenunder.com","burymercury.co.uk","calgaryherald.com","camchickscaps.com","cameronaggies.com","candyteenporn.com","catatanonline.com","cavalierstream.fr","cdn.gledaitv.live","celebritablog.com","charbelnemnom.com","chat.tchatche.com","cheat.hax4you.net","cheboygannews.com","checkfiletype.com","chicksonright.com","cinecalidad5.site","cinema-sketch.com","citethisforme.com","citizen-times.com","citpekalongan.com","ciudadblogger.com","claplivehdplay.ru","clarionledger.com","classicreload.com","clickjogos.com.br","cloudhostingz.com","coatingsworld.com","codingshiksha.com","coempregos.com.br","compota-soft.work","computercrack.com","computerhilfen.de","comunidadgzone.es","conferenceusa.com","consoletarget.com","cool-style.com.tw","coolmath4kids.com","coolmathgames.com","countrylife.co.uk","countypress.co.uk","countytimes.co.uk","crichd-player.top","cruisingearth.com","cryptednews.space","cryptoblog24.info","cryptowidgets.net","crystalcomics.com","cumbrialife.co.uk","curiosidadtop.com","cyclingweekly.com","daemon-hentai.com","dailyamerican.com","dailybulletin.com","dailydemocrat.com","dailyfreebits.com","dailygeekshow.com","dailytech-news.eu","damndelicious.net","darts-scoring.com","dawnofthedawg.com","dealsfinders.blog","dearcreatives.com","deine-tierwelt.de","deinesexfilme.com","dejongeturken.com","denverbroncos.com","descarga-animex.*","design4months.com","designtagebuch.de","desitelugusex.com","developer.arm.com","diamondfansub.com","diaridegirona.cat","diariocordoba.com","diencobacninh.com","dirtyindianporn.*","dissmercury.co.uk","doctor-groups.com","dodi-repacks.site","dorohedoro.online","downloadapps.info","downloadtanku.org","downloadudemy.com","downloadwella.com","duellinksmeta.com","dynastyseries.com","dzienniklodzki.pl","e-hausaufgaben.de","ealingtimes.co.uk","earninginwork.com","easyjapanesee.com","easyvidplayer.com","ebonyassclips.com","eczpastpapers.net","editions-actu.org","einfachtitten.com","elamigosgames.net","elamigosgamez.com","elamigosgamez.net","elystandard.co.uk","empire-streamz.fr","emulatorgames.net","encurtandourl.com","encurtareidog.top","engel-horoskop.de","enormousbabes.net","entertubeporn.com","epsilonakdemy.com","eromanga-show.com","estrepublicain.fr","eternalmangas.org","etownbluejays.com","euro2024direct.ru","eurotruck2.com.br","extreme-board.com","extremotvplay.com","faceittracker.net","fansonlinehub.com","fantasticporn.net","fastconverter.net","fatgirlskinny.net","fattubevideos.net","femalefirst.co.uk","fgcuathletics.com","fightinghawks.com","file.magiclen.org","fileditchfiles.me","financefernly.com","financialpost.com","finanzas-vida.com","fineretroporn.com","finexxxvideos.com","fitnakedgirls.com","fitnessplanss.com","flight-report.com","floridagators.com","foguinhogames.net","foodtalkdaily.com","footballstream.tv","footfetishvid.com","footstockings.com","fordownloader.com","formatlibrary.com","forum.blu-ray.com","fplstatistics.com","free-wargamer.com","freeboytwinks.com","freecodezilla.net","freecourseweb.com","freemagazines.top","freeoseocheck.com","freepdf-books.com","freepornrocks.com","freepornstream.cc","freepornvideo.sex","freepornxxxhd.com","freerealvideo.com","freethesaurus.com","freex2line.online","freexxxvideos.pro","french-streams.cc","freshstuff4u.info","friendproject.net","frkn64modding.com","frosinonetoday.it","fuerzasarmadas.eu","fuldaerzeitung.de","fullfreeimage.com","fullxxxmovies.net","futbolsayfasi.net","games-manuals.com","games.puzzler.com","games.thestar.com","gamesofdesire.com","gaminggorilla.com","gastongazette.com","gay-streaming.com","gaypornhdfree.com","gebrauchtwagen.at","getwallpapers.com","gewinde-normen.de","girlsofdesire.org","girlswallowed.com","globalstreams.xyz","gobigtitsporn.com","goblueraiders.com","godriveplayer.com","gogetapast.com.br","gogueducation.com","goltelevision.com","googleapis.com.de","googleapis.com.do","gothunderbirds.ca","gowatchseries.net","grannyfuckxxx.com","grannyxxxtube.net","graphicgoogle.com","grsprotection.com","gwiazdatalkie.com","hakunamatata5.org","hallo-muenchen.de","happy-otalife.com","hardcoregamer.com","hardwaretimes.com","harrowtimes.co.uk","hbculifestyle.com","hdfilmizlesen.com","hdvintagetube.com","headlinerpost.com","healbot.dpm15.net","healthcheckup.com","hegreartnudes.com","help.cashctrl.com","hentaibrasil.info","hentaienglish.com","hentaitube.online","heraldtribune.com","herefordtimes.com","hideandseek.world","hikarinoakari.com","hollywoodlife.com","hostingunlock.com","hotkitchenbag.com","hotmaturetube.com","hotspringsofbc.ca","howtoconcepts.com","hunterscomics.com","hyperosthemes.org","iedprivatedqu.com","igniteseurope.com","imgdawgknuttz.com","imperialstudy.com","independent.co.uk","indianporn365.net","indofirmware.site","indojavstream.com","infinityscans.net","infinityscans.org","infinityscans.xyz","inside-digital.de","insidermonkey.com","instantcloud.site","insurancepost.xyz","integraforums.com","ipswichstar.co.uk","ironwinter6m.shop","isabihowto.com.ng","isekaisubs.web.id","isminiunuttum.com","ithacajournal.com","jamesbornmain.com","janammusic.in.net","japaneseholes.com","japanpornclip.com","japanxxxworld.com","jardiner-malin.fr","jokersportshd.org","juegos.elpais.com","k-statesports.com","k-statesports.net","k-statesports.org","kandisvarlden.com","kenshi.fandom.com","kh-pokemon-mc.com","khabardinbhar.net","kickasstorrents.*","kill-the-hero.com","kimcilonlyofc.com","kiuruvesilehti.fi","know-how-tree.com","kontenterabox.com","kontrolkalemi.com","koreanbeauty.club","korogashi-san.org","kreis-anzeiger.de","kurierlubelski.pl","lachainemeteo.com","lacuevadeguns.com","laksa19.github.io","lavozdegalicia.es","lebois-racing.com","lecanalauditif.ca","lectormangass.net","lecturisiarome.ro","leechpremium.link","leechyscripts.net","lheritierblog.com","libertestreamvf.*","limontorrents.com","line-stickers.com","link.snipcash.com","link.turkdown.com","linuxsecurity.com","locatedinfain.com","lonely-mature.com","lovegrowswild.com","lubbockonline.com","lucagrassetti.com","luciferdonghua.in","luckypatchers.com","lycoathletics.com","m.biquge12345.com","macanevowners.com","madhentaitube.com","malaysiastock.biz","mangakakalove.com","maps4study.com.br","marieclaire.co.uk","mature-chicks.com","maturepussies.pro","mdzsmutpcvykb.net","media.cms.nova.cz","megajapantube.com","metaforespress.gr","mfmfinancials.com","miaminewtimes.com","milfpussy-sex.com","minecraftwild.com","mizugigurabia.com","mlbpark.donga.com","mlbstreaming.live","mmorpgplay.com.br","mobilanyheter.net","modelsxxxtube.com","modescanlator.net","mommyporntube.com","momstube-porn.com","moonblinkwifi.com","motorradonline.de","moviediskhd.cloud","movielinkbd4u.com","moviezaddiction.*","mp3cristianos.net","mundovideoshd.com","murtonroofing.com","music.youtube.com","muyinteresante.es","myabandonware.com","myair2.resmed.com","myfunkytravel.com","mynakedwife.video","mzansixporn.co.za","nasdaqfutures.org","national-park.com","negative.tboys.ro","nepalieducate.com","networklovers.com","new-xxxvideos.com","newsandstar.co.uk","newsshopper.co.uk","ngin-mobility.com","nieuwsvandedag.nl","nightlifeporn.com","nikkeifutures.org","njwildlifecam.com","nobodycancool.com","nonsensediamond.*","northeast.aaa.com","nzpocketguide.com","oceanof-games.com","oceanoffgames.com","odekake-spots.com","officedepot.co.cr","officialpanda.com","olemisssports.com","ondemandkorea.com","onepiecepower.com","onlinemschool.com","onlinesextube.com","onlineteenhub.com","ontariofarmer.com","openspeedtest.com","opensubtitles.com","oportaln10.com.br","osmanonline.co.uk","osthessen-news.de","ottawacitizen.com","ottrelease247.com","outdoorchannel.de","overwatchporn.xxx","pahaplayers.click","palmbeachpost.com","pandaznetwork.com","panel.skynode.pro","pantyhosepink.com","paramountplus.com","patriotledger.com","pghk.blogspot.com","phimlongtieng.net","phoenix-manga.com","phonefirmware.com","piazzagallura.org","pistonpowered.com","plantatreenow.com","play.aidungeon.io","playembedapi.site","player.glomex.com","playerflixapi.com","playerjavseen.com","playmyopinion.com","playporngames.com","playstreaming.win","pleated-jeans.com","pockettactics.com","popcornmovies.org","pornanimetube.com","porngirlstube.com","pornoenspanish.es","pornoschlange.com","pornxxxvideos.net","practicalkida.com","prague-blog.co.il","premiumporn.org>>","prensaesports.com","prescottenews.com","press-citizen.com","pressconnects.com","presstelegram.com","primeanimesex.com","primeflix.website","progameguides.com","project-free-tv.*","projectfreetv.one","promisingapps.com","promo-visits.site","protege-liens.com","publicananker.com","publicdomainq.net","publicdomainr.net","publicflashing.me","punisoku.blogo.jp","pussytorrents.org","qatarstreams.me>>","qualityrental.com","queenofmature.com","radiolovelive.com","radiosymphony.com","ragnarokmanga.com","rancheroforum.com","randomarchive.com","rateyourmusic.com","rawindianporn.com","readallcomics.com","readcomiconline.*","readfireforce.com","realvoyeursex.com","redesigndaily.com","registerguard.com","reloadedsteam.com","reporterpb.com.br","reprezentacija.rs","retrosexfilms.com","reviewjournal.com","rhyljournal.co.uk","richieashbeck.com","robloxscripts.com","rojadirectatvhd.*","roms-download.com","roznamasiasat.com","rule34.paheal.net","samfordsports.com","sanangelolive.com","sanmiguellive.com","santafeforums.com","sarkarinaukry.com","sayphotobooth.com","scandichotels.com","schoolsweek.co.uk","scirocconet.co.uk","scontianastro.com","screenfetch4.cyou","searchnsucceed.in","seasons-dlove.net","seatroutforum.com","send-anywhere.com","series9movies.com","sexmadeathome.com","sexyebonyteen.com","sexyfreepussy.com","shahiid-anime.net","shanelocaldog.com","share.filesh.site","shentai-anime.com","shinshi-manga.net","shittokuadult.net","shootersforum.com","shootingworld.com","shortencash.click","shotgunforums.com","shrink-service.it","sidearmsocial.com","sideplusleaks.com","sierraevforum.com","sim-kichi.monster","simply-hentai.com","simplywhisked.com","simulatormods.com","skidrow-games.com","skillheadlines.in","skodacommunity.de","skylineowners.com","slaughtergays.com","smallseotools.com","soccerworldcup.me","softwaresblue.com","solsticeforum.com","solterraforum.com","sotemnovinhas.com","south-park-tv.biz","spectrum.ieee.org","speculationis.com","spiritparting.com","sponsorhunter.com","sportanalytic.com","sportingsurge.com","sportsbuff.stream","sportsgames.today","sportzonline.site","stapadblockuser.*","steam-repacks.net","stellarthread.com","stepsisterfuck.me","stingerforums.com","storefront.com.ng","stories.los40.com","straatosphere.com","streamadblocker.*","streaming-one.com","streamingunity.to","streamlivetv.site","streamonsport99.*","streamseeds24.com","streamshunters.eu","stringreveals.com","suanoticia.online","subaruoutback.org","subaruxvforum.com","super-ethanol.com","superflixapi.best","surreycomet.co.uk","suzuki-forums.com","suzuki-forums.net","suzukicentral.com","szaszmotorshop.hu","tabele-kalorii.pl","taifood-blog.asia","tamaratattles.com","tamilbrahmins.com","tamilsexstory.net","tattoosbeauty.com","tautasdziesmas.lv","techadvisor.co.uk","techiepirates.com","techlog.ta-yan.ai","technewsrooms.com","technewsworld.com","techsolveprac.com","teenpornvideo.sex","teenpornvideo.xxx","testlanguages.com","texture-packs.com","thaihotmodels.com","thangdangblog.com","the-gazette.co.uk","theadvertiser.com","theandroidpro.com","thecelticblog.com","thecubexguide.com","thedailybeast.com","thedigitalfix.com","thefreebieguy.com","thegamearcade.com","thehealthsite.com","theismailiusa.org","thekingavatar.com","theliveupdate.com","theouterhaven.net","theregister.co.uk","theresident.co.uk","thermoprzepisy.pl","theworldobits.com","thousandbabes.com","tichyseinblick.de","tiktokcounter.net","times-gazette.com","timesnowhindi.com","timesreporter.com","timestelegram.com","titfuckvideos.com","tmail.sys64738.at","tomatespodres.com","toplickevesti.com","topsworldnews.com","toptenreviews.com","torrent-pirat.com","torrentdownload.*","trannylibrary.com","trannyxxxtube.net","truyen-hentai.com","truyenaudiocv.net","tubepornasian.com","tubepornstock.com","ultimate-catch.eu","ultrateenporn.com","umatechnology.org","undeadwalking.com","unsere-helden.com","uptechnologys.com","urjalansanomat.fi","url.gem-flash.com","utepathletics.com","vanillatweaks.net","venusarchives.com","vide-greniers.org","video.gazzetta.it","videogameszone.de","videos.remilf.com","vietnamanswer.com","viralitytoday.com","virtualnights.com","visualnewshub.com","vitalitygames.com","voiceofdenton.com","voyeurpornsex.com","voyeurspyporn.com","voyeurxxxfree.com","walesfarmer.co.uk","wannafreeporn.com","wap.biqugewx.info","wap.yushuwu.cloud","watchanimesub.net","watchfacebook.com","watchsouthpark.tv","websiteglowgh.com","weknowconquer.com","welcometojapan.jp","wirralglobe.co.uk","wirtualnemedia.pl","wohnmobilforum.de","worldfreeware.com","worldgreynews.com","worthitorwoke.com","wpsimplehacks.com","xfreepornsite.com","xhamsterdeutsch.*","xnxx-sexfilme.com","xxxonlinefree.com","xxxpussyclips.com","xxxvideostrue.com","yesdownloader.com","yummysextubes.com","zeenews.india.com","zeijakunahiko.com","zeroto60times.com","zippysharecue.com","1001tracklists.com","101soundboards.com","123moviesready.org","123moviestoday.net","1337x.unblock2.xyz","247footballnow.com","7daystodiemods.com","adblockeronstape.*","addictinggames.com","adultasianporn.com","advertisertape.com","afasiaarchzine.com","airportwebcams.net","akuebresources.com","allureamateurs.net","alternativa104.net","amateur-mature.net","americansoda.co.uk","androidcentral.com","angrybirdsnest.com","animesonliner4.com","anothergraphic.org","antenasport.online","arcade.buzzrtv.com","arcadeprehacks.com","arkadiumhosted.com","arsiv.mackolik.com","asian-teen-sex.com","asianbabestube.com","asianpornfilms.com","asiansexdiarys.com","asianstubefuck.com","atlasstudiousa.com","autocadcommand.com","badasshardcore.com","baixedetudo.net.br","ballexclusives.com","barstoolsports.com","basic-tutorials.de","bdsmslavemovie.com","beamng.wesupply.cx","bearchasingart.com","beermoneyforum.com","beginningmanga.com","berliner-kurier.de","beruhmtemedien.com","best-xxxvideos.com","bestialitytaboo.tv","bettingexchange.it","bidouillesikea.com","bigdata-social.com","bigdata.rawlazy.si","bigpiecreative.com","bigsouthsports.com","bigtitsxxxfree.com","birdsandblooms.com","blisseyhusband.net","blogredmachine.com","blogx.almontsf.com","blowjobamateur.net","blowjobpornset.com","bluecoreinside.com","bluemediastorage.*","bombshellbling.com","bonsaiprolink.shop","bosoxinjection.com","bridportnews.co.uk","businessinsider.de","calculatorsoup.com","camwhorescloud.com","cararegistrasi.com","casos-aislados.com","cayenneevforum.com","cdimg.blog.2nt.com","cehennemstream.xyz","cerbahealthcare.it","cheshirelife.co.uk","chiangraitimes.com","chicagobearshq.com","chicagobullshq.com","chicasdesnudas.xxx","chikianimation.org","cintateknologi.com","clampschoolholic.*","classicalradio.com","classicxmovies.com","climaaovivo.com.br","clothing-mania.com","codingnepalweb.com","coleccionmovie.com","comeumamao.monster","comicspornoxxx.com","comparteunclic.com","contractpharma.com","cornwalllife.co.uk","cotswoldlife.co.uk","couponscorpion.com","cr7-soccer.store>>","cravenherald.co.uk","creditcardrush.com","crimsonscrolls.net","crm.urlwebsite.com","cronachedibirra.it","cronachesalerno.it","cryptonworld.space","dallasobserver.com","datapendidikan.com","dawgpounddaily.com","dcdirtylaundry.com","delawareonline.com","denverpioneers.com","depressionhurts.us","derehamtimes.co.uk","descargaspcpro.net","desifuckonline.com","deutschekanale.com","devicediary.online","dianaavoidthey.com","diariodenavarra.es","digicol.dpm.org.cn","dirtyasiantube.com","dirtygangbangs.com","discover-sharm.com","diyphotography.net","diyprojectslab.com","donghuanosekai.com","doublemindtech.com","downloadcursos.top","downloadgames.info","downloadmusic.info","downloadpirate.com","dragonball-zxk.com","dramathical.stream","dulichkhanhhoa.net","e-mountainbike.com","elconfidencial.com","elearning-cpge.com","embed-player.space","empire-streaming.*","english-dubbed.com","english-topics.com","ent.f-frontier.com","enterprisenews.com","ericeastweight.com","essexlifemag.co.uk","eugenemakedraw.com","evdeingilizcem.com","eveningtimes.co.uk","eveningtribune.com","exactlyhowlong.com","expressbydgoski.pl","extremosports.club","familyhandyman.com","favoyeurtube.net>>","fightingillini.com","financialjuice.com","fireflix.pages.dev","flacdownloader.com","flashgirlgames.com","flashingjungle.com","foodiesgallery.com","foreversparkly.com","formasyonhaber.net","forum.cstalking.tv","francaisfacile.net","free-gay-clips.com","freeadultcomix.com","freeadultvideos.cc","freebiesmockup.com","freecoursesite.com","freefireupdate.com","freegogpcgames.com","freegrannyvids.com","freemockupzone.com","freemoviesfull.com","freepornasians.com","freepublicporn.com","freereceivesms.com","freeviewmovies.com","freevipservers.net","freevstplugins.net","freewoodworking.ca","freex2line.onlinex","freshwaterdell.com","friscofighters.com","fritidsmarkedet.dk","fuckhairygirls.com","fuckingsession.com","fullvideosporn.com","gamerevolution.com","games.arkadium.com","games.kentucky.com","games.mashable.com","games.thestate.com","gamingforecast.com","gaypornmasters.com","gazetakrakowska.pl","gazetazachodnia.eu","gazette-news.co.uk","gdrivelatinohd.net","geniale-tricks.com","geniussolutions.co","girlsgogames.co.uk","glasgowtimes.co.uk","go.bucketforms.com","goafricaonline.com","gobankingrates.com","gocurrycracker.com","godrakebulldog.com","gojapaneseporn.com","golf.rapidmice.com","gorro-4go5b3nj.fun","greeksubsmovies.me","grouppornotube.com","gruenderlexikon.de","gudangfirmwere.com","guessthemovie.name","guessthephrase.xyz","guiafinanceiro.top","hamptonpirates.com","hard-tube-porn.com","healthfirstweb.com","healthnewsreel.com","healthy4pepole.com","heatherdisarro.com","hentaipornpics.net","hentaisexfilms.com","heraldscotland.com","heraldseries.co.uk","hibsobserver.co.uk","hiddencamstube.com","highkeyfinance.com","hindustantimes.com","homeairquality.org","homebuilding.co.uk","homemoviestube.com","hotanimevideos.com","hotbabeswanted.com","hotxxxjapanese.com","hqamateurtubes.com","https-xhamster.com","huffingtonpost.com","huitranslation.com","humanbenchmark.com","hyundaitucson.info","idedroidsafelink.*","idevicecentral.com","ifreemagazines.com","imagetranslator.io","indecentvideos.com","indesignskills.com","indianbestporn.com","indianpornvideos.*","indiansexbazar.com","infinitehentai.com","infinityblogger.in","infojabarloker.com","informatudo.com.br","informaxonline.com","insidemarketing.it","insidememorial.com","insider-gaming.com","intercelestial.com","investor-verlag.de","iowaconference.com","italianporn.com.es","ithinkilikeyou.net","iusedtobeaboss.com","jacksonguitars.com","japanesemomsex.com","japanesetube.video","jeepreconforum.com","jemontremabite.com","jeux.meteocity.com","johnfullwonder.com","jojolandsmanga.com","joomlabeginner.com","jujustu-kaisen.com","juliewomanwish.com","justfamilyporn.com","justpicsplease.com","justtoysnoboys.com","kawaguchimaeda.com","keighleynews.co.uk","kellywhatcould.com","keralatelecom.info","kickasstorrents2.*","kilburntimes.co.uk","kittyfuckstube.com","knowyourphrase.com","kobitacocktail.com","komisanwamanga.com","kr-weathernews.com","krebs-horoskop.com","kstatefootball.net","kstatefootball.org","laopinioncoruna.es","leagueofgraphs.com","leckerschmecker.me","legiongamesgod.com","leighjournal.co.uk","leo-horoscopes.com","letribunaldunet.fr","leviathanmanga.com","levismodding.co.uk","lib.hatenablog.com","lincolncourier.com","link.get2short.com","link.paid4link.com","linkedmoviehub.top","linux-community.de","listenonrepeat.com","literarysomnia.com","littlebigsnake.com","localemagazine.com","longbeachstate.com","lotus-tours.com.hk","loyolaramblers.com","luzernerzeitung.ch","lyricsongation.com","m.timesofindia.com","magazyn-kuchnia.pl","maggotdrowning.com","magicgameworld.com","maketecheasier.com","makotoichikawa.net","mallorcazeitung.es","manager-magazin.de","mangas-origines.fr","manoramaonline.com","maraudersports.com","mathplayground.com","maturetubehere.com","maturexxxclips.com","mcdonoughvoice.com","mediascelebres.com","megafilmeshd50.com","megahentaitube.com","megapornfreehd.com","mein-wahres-ich.de","memorialnotice.com","merlininkazani.com","mespornogratis.com","mesquitaonline.com","minddesignclub.org","minecraftskins.com","minhasdelicias.com","mobilelegends.shop","mobiletvshows.site","modele-facture.com","moflix-stream.fans","montereyherald.com","motorcyclenews.com","moviescounnter.com","moviesonlinefree.*","mygardening411.com","myhentaicomics.com","mymusicreviews.com","myneobuxportal.com","mypornstarbook.net","nadidetarifler.com","naijachoice.com.ng","nakedgirlsroom.com","nakedneighbour.com","netaffiliation.com","neueroeffnung.info","nevadawolfpack.com","newarkadvocate.com","newjapanesexxx.com","news-geinou100.com","newyorkupstate.com","nicematureporn.com","niestatystyczny.pl","nightdreambabe.com","nlab.itmedia.co.jp","nontonvidoy.online","noodlemagazine.com","nudebeachpussy.com","nudecelebforum.com","nuevos-mu.ucoz.com","nyharborwebcam.com","o2tvseries.website","oceanbreezenyc.org","officegamespot.com","ondigitalocean.app","onepunch-manga.com","onetimethrough.com","onlinesudoku.games","onlinetutorium.com","onlinework4all.com","onlygoldmovies.com","onscreensvideo.com","openchat-review.me","pakistaniporn2.com","passeportsante.net","passportaction.com","pc-spiele-wiese.de","pcgamedownload.net","pcgameshardware.de","peachprintable.com","peliculas-dvdrip.*","penarthtimes.co.uk","penisbuyutucum.net","pestleanalysis.com","pinayviralsexx.com","plainasianporn.com","play.starsites.fun","player.euroxxx.net","player.vidplus.pro","playeriframe.lol>>","playretrogames.com","pliroforiki-edu.gr","policesecurity.com","policiesreview.com","polskawliczbach.pl","pornhubdeutsch.net","pornmaturetube.com","pornohubonline.com","pornovideos-hd.com","pornvideospass.com","powerthesaurus.org","premiumstream.live","present.rssing.com","printablecrush.com","problogbooster.com","productkeysite.com","progress-index.com","projectfreetv2.com","projuktirkotha.com","proverbmeaning.com","psicotestuned.info","pussytubeebony.com","racedepartment.com","radio-en-direct.fr","radioitalylive.com","radionorthpole.com","ratemyteachers.com","realfreelancer.com","realtormontreal.ca","recherche-ebook.fr","record-courier.com","redamateurtube.com","redbubbletools.com","redstormsports.com","replica-watch.info","reporter-times.com","reporterherald.com","rightdark-scan.com","rincondelsazon.com","ripcityproject.com","risefromrubble.com","romaniataramea.com","royston-crow.co.uk","sabornutritivo.com","samrudhiglobal.com","samurai.rzword.xyz","sankakucomplex.com","scarletandgame.com","scarletknights.com","schoener-wohnen.de","sciencechannel.com","scopateitaliane.it","scramblerforum.com","seacoastonline.com","seamanmemories.com","selfstudybrain.com","sexiestpicture.com","sexteenxxxtube.com","sexy-youtubers.com","sexykittenporn.com","sexymilfsearch.com","shadowrangers.live","sheboyganpress.com","shemaletoonsex.com","shipseducation.com","shipsnostalgia.com","shrivardhantech.in","shutupandgo.travel","sidelionreport.com","sidexsideworld.com","siirtolayhaber.com","simpledownload.net","siteunblocked.info","skyscrapercity.com","slingshotforum.com","slowianietworza.pl","smithsonianmag.com","snowplowforums.com","soccerstream100.to","sociallyindian.com","sooeveningnews.com","sosyalbilgiler.net","southparkstudios.*","spank-and-bang.com","spoiledmaltese.com","sportbikeworld.com","sports-arena.space","sportstohfa.online","stapewithadblock.*","starbikeforums.com","starnewsonline.com","stevesnovasite.com","sthelensstar.co.uk","stingrayforums.com","stirlingnews.co.uk","stormtrakforum.com","stream.nflbox.me>>","streamelements.com","streaming-french.*","strtapeadblocker.*","sturgisjournal.com","subarubrzforum.com","subaruforester.org","surgicaltechie.com","sweeteroticart.com","syracusecrunch.com","tamilultratv.co.in","tapeadsenjoyer.com","tauntongazette.com","tcpermaculture.com","technicalviral.com","telefullenvivo.com","telexplorer.com.ar","theblissempire.com","thecalifornian.com","thecelticbhoys.com","theendlessmeal.com","thegardnernews.com","thegoldendaily.com","thehentaiworld.com","thelesbianporn.com","thepewterplank.com","thepiratebay10.org","theralphretort.com","thestarphoenix.com","thesuperdownload.*","thetimesherald.com","thiagorossi.com.br","thisisourbliss.com","tiervermittlung.de","tiktokrealtime.com","times-series.co.uk","times-standard.com","timesandstar.co.uk","tiny-sparklies.com","tokyo-ghoul.online","tonpornodujour.com","topbiography.co.in","torrentdosfilmes.*","torrentdownloads.*","totalsportekhd.com","traductionjeux.com","trannysexmpegs.com","transgirlslive.com","traveldesearch.com","travelplanspro.com","trendyol-milla.com","tribeathletics.com","trovapromozioni.it","truckingboards.com","truyenbanquyen.com","truyenhentai18.net","tuhentaionline.com","tulsahurricane.com","turboimagehost.com","tuscaloosanews.com","tv3play.skaties.lv","tvonlinesports.com","tweaksforgeeks.com","txstatebobcats.com","ucirvinesports.com","ukrainesmodels.com","uncensoredleak.com","universfreebox.com","unlimitedfiles.xyz","urbanmilwaukee.com","urlaubspartner.net","venus-and-mars.com","vermangasporno.com","victor-mochere.com","videos.porndig.com","videosinlevels.com","videosxxxputas.com","vintagepornfun.com","vintagepornnew.com","vintagesexpass.com","waitrosecellar.com","washingtonpost.com","watch.rkplayer.xyz","watch.shout-tv.com","watchadsontape.com","wblaxmibhandar.com","weakstreams.online","web.livecricket.is","webloadedmovie.com","websitesbridge.com","weightlossdiet.top","werra-rundschau.de","wheatbellyblog.com","wildhentaitube.com","windowscentral.com","windowsmatters.com","winteriscoming.net","wohnungsboerse.net","woman.excite.co.jp","work.weixin.qq.com","worldofpcgames.com","worldstreams.click","wormser-zeitung.de","www.cloudflare.com","www.primevideo.com","xbox360torrent.com","xda-developers.com","xn--kckzb2722b.com","xpressarticles.com","xxx-asian-tube.com","xxxanimemovies.com","xxxanimevideos.com","yify-subtitles.org","youngpussyfuck.com","youwatch-serie.com","yt-downloaderz.com","ytmp4converter.com","zxi.mytechroad.com","aachener-zeitung.de","abukabir.fawrye.com","abyssplay.pages.dev","academiadelmotor.es","adblockstreamtape.*","addtobucketlist.com","adultgamesworld.com","agrigentonotizie.it","aliendictionary.com","allafricangirls.net","allindiaroundup.com","alloaadvertiser.com","allporncartoons.com","almohtarif-tech.net","altadefinizione01.*","amateur-couples.com","amaturehomeporn.com","amazingtrannies.com","androidrepublic.org","angeloyeo.github.io","animefuckmovies.com","animeonlinefree.org","animesonlineshd.com","annoncesescorts.com","anonymous-links.com","anonymousceviri.com","app.link2unlock.com","aprenderquechua.com","arabianbusiness.com","ardrossanherald.com","arizonawildcats.com","arnaqueinternet.com","arrowheadaddict.com","artificialnudes.com","asiananimaltube.org","asianfuckmovies.com","asianporntube69.com","audiobooks4soul.com","audiotruyenfull.com","bailbondsfinder.com","beautypackaging.com","beisbolinvernal.com","berliner-zeitung.de","bestmaturewomen.com","bigcockfreetube.com","bigsouthnetwork.com","blackenterprise.com","blog.cloudflare.com","bluemediadownload.*","bordertelegraph.com","bracknellnews.co.uk","brentwoodlive.co.uk","businessinsider.com","calculascendant.com","casteloforte.com.br","celebritynakeds.com","celebsnudeworld.com","centerfabril.com.br","certificateland.com","chakrirkhabar247.in","championpeoples.com","chawomenshockey.com","chicagosportshq.com","christiantrendy.com","chubbypornmpegs.com","citationmachine.net","civilenggforall.com","classicpornbest.com","classicpornvids.com","clydebankpost.co.uk","collegeteentube.com","columbiacougars.com","columbiatribune.com","comicsxxxgratis.com","commande.rhinov.pro","commsbusiness.co.uk","comofuncionaque.com","compilationtube.xyz","comprovendolibri.it","concealednation.org","consigliatodanoi.it","couponsuniverse.com","courier-journal.com","coworkingczerska.pl","crackedsoftware.biz","creativebusybee.com","crossdresserhub.com","crystal-launcher.pl","custommapposter.com","daddyfuckmovies.com","dailycommercial.com","dailyjobposting.xyz","dailymaverick.co.za","dartmouthsports.com","der-betze-brennt.de","descargatepelis.com","deseneledublate.com","desktopsolution.org","detroitjockcity.com","dev.fingerprint.com","developerinsider.co","diariodemallorca.es","diarioeducacion.com","dichvureviewmap.com","diendancauduong.com","digitalfernsehen.de","digitalseoninja.com","digitalstudiome.com","dignityobituary.com","discordfastfood.com","divinelifestyle.com","divxfilmeonline.net","dktechnicalmate.com","download.megaup.net","dubipc.blogspot.com","dynamicminister.net","dziennikbaltycki.pl","dziennikpolski24.pl","dziennikzachodni.pl","edmontonjournal.com","elamigosedition.com","ellibrepensador.com","embed.tmp-url.pro>>","en-thunderscans.com","erotaredogaonly.xyz","erotic-beauties.com","eveningnews24.co.uk","eventiavversinews.*","expresskaszubski.pl","fakenhamtimes.co.uk","fansubseries.com.br","fatblackmatures.com","faucetcaptcha.co.in","felicetommasino.com","femdomporntubes.com","fifaultimateteam.it","filmeonline2018.net","filmesonlinehd1.org","firstasianpussy.com","footballfancast.com","footballstreams.lol","footballtransfer.ru","fortnitetracker.com","fplstatistics.co.uk","free-trannyporn.com","freecoursesites.com","freecoursesonline.*","freegamescasual.com","freeindianporn.mobi","freeindianporn2.com","freeplayervideo.com","freescorespiano.com","freesexvideos24.com","freetarotonline.com","freshsexxvideos.com","frustfrei-lernen.de","fuckmonstercock.com","fuckslutsonline.com","futura-sciences.com","gagaltotal666.my.id","gallant-matures.com","gamecocksonline.com","games.bradenton.com","games.dailymail.com","games.fresnobee.com","games.heraldsun.com","games.sunherald.com","gazetawroclawska.pl","gazetteherald.co.uk","gazetteseries.co.uk","generacionretro.net","gesund-vital.online","gfilex.blogspot.com","global.novelpia.com","gloswielkopolski.pl","goarmywestpoint.com","godrakebulldogs.com","godrakebulldogs.net","goodnewsnetwork.org","hailfloridahail.com","halesowennews.co.uk","hamburgerinsult.com","hamivideo.hinet.net","hardcorelesbian.xyz","hardwarezone.com.sg","hardwoodhoudini.com","hartvannederland.nl","haus-garten-test.de","haveyaseenjapan.com","hawaiiathletics.com","hayamimi-gunpla.com","healthbeautybee.com","helper-employer.com","helpnetsecurity.com","hentai-mega-mix.com","hentaianimezone.com","hentaisexuality.com","heraldmailmedia.com","hieunguyenphoto.com","highdefdiscnews.com","hindimatrashabd.com","hindimearticles.net","hindimoviesonline.*","historicaerials.com","hmc-id.blogspot.com","hollandsentinel.com","home-xxx-videos.com","homesandgardens.com","horseshoeheroes.com","hotbeautyhealth.com","hotorientalporn.com","hqhardcoreporno.com","ianrequireadult.com","ilbolerodiravel.org","ilforumdeibrutti.is","ilkleygazette.co.uk","independentmail.com","indianpornvideo.org","individualogist.com","ingyenszexvideok.hu","insidertracking.com","insidetheiggles.com","interculturalita.it","inventionsdaily.com","iptvxtreamcodes.com","itsecuritynews.info","iulive.blogspot.com","jacquieetmichel.net","japanesexxxporn.com","jessicaclearout.com","journalstandard.com","justcastingporn.com","justsexpictures.com","k-statefootball.net","k-statefootball.org","kentstatesports.com","kingjamesgospel.com","kingsofkauffman.com","kissmaturestube.com","klettern-magazin.de","kstateathletics.com","ladypopularblog.com","lawweekcolorado.com","learnchannel-tv.com","legionpeliculas.org","legionprogramas.org","leitesculinaria.com","lemino.docomo.ne.jp","letrasgratis.com.ar","lifeisbeautiful.com","limiteddollqjc.shop","lindalastattack.com","livetv.moviebite.cc","livingstondaily.com","localizaagencia.com","m.economictimes.com","m.jobinmeghalaya.in","marketrevolution.eu","masashi-blog418.com","massagefreetube.com","maturepornphoto.com","measuringflower.com","mediatn.cms.nova.cz","meeting.tencent.com","megajapanesesex.com","meicho.marcsimz.com","miamiairportcam.com","miamibeachradio.com","midweekherald.co.uk","migliori-escort.com","mikaylaarealike.com","mindmotion93y8.shop","minecraftraffle.com","minhaconexao.com.br","minutemirror.com.pk","mittelbayerische.de","mobilesexgamesx.com","montrealgazette.com","morinaga-office.net","motherandbaby.co.uk","movies-watch.com.pk","multicanaistt.space","mycentraljersey.com","myhentaigallery.com","mynaturalfamily.com","myreadingmanga.info","norwichbulletin.com","noticiascripto.site","novelsparadise.site","nude-beach-tube.com","nudeselfiespics.com","nurparatodos.com.ar","obituaryupdates.com","octavestreaming.com","oldgrannylovers.com","onlinefetishporn.cc","onlinepornushka.com","opisanie-kartin.com","orangespotlight.com","outdoor-magazin.com","painting-planet.com","parasportontario.ca","parrocchiapalata.it","perfectmomsporn.com","petitegirlsnude.com","pharmaguideline.com","phoenixnewtimes.com","phonereviewinfo.com","picspornamateur.com","planetminecraft.com","platform.autods.com","play.dictionary.com","play.geforcenow.com","play.playkrx18.site","player.popfun.co.uk","player.uwatchfree.*","pompanobeachcam.com","popularasianxxx.com","pornjapanesesex.com","pornocolegialas.org","pornocolombiano.net","pornosubtitula2.com","pornstarsadvice.com","portmiamiwebcam.com","porttampawebcam.com","pranarevitalize.com","protege-torrent.com","psychology-spot.com","publicidadtulua.com","quest.to-travel.net","raccontivietati.com","radiosantaclaus.com","radiotormentamx.com","rangersreview.co.uk","readcomicsonline.ru","realitybrazzers.com","redowlanalytics.com","relampagomovies.com","reneweconomy.com.au","richmondspiders.com","ripplestream4u.shop","rojadirectaenhd.net","rojadirectatvlive.*","rollingglobe.online","romanticlesbian.com","rundschau-online.de","ryanmoore.marketing","rysafe.blogspot.com","samurai.wordoco.com","santacruzforums.com","santoinferninho.com","savingsomegreen.com","scansatlanticos.com","scholarshiplist.org","schrauben-normen.de","secondhandsongs.com","sempredirebanzai.it","sempreupdate.com.br","serieshdpormega.com","seriezloaded.com.ng","setsuyakutoushi.com","sex-free-movies.com","sexyvintageporn.com","shogaisha-shuro.com","shogaisha-techo.com","shreveporttimes.com","silveradosierra.com","sixsistersstuff.com","skidrowreloaded.com","slingshotforums.com","smartkhabrinews.com","snowblowerforum.com","snowmobileforum.com","snowmobileworld.com","soap2day-online.com","soccerfullmatch.com","soccerworldcup.me>>","sociologicamente.it","somerset-life.co.uk","somulhergostosa.com","sourcingjournal.com","sousou-no-frieren.*","southcoasttoday.com","spa.center.ivof.com","sportitalialive.com","sportowefakty.wp.pl","sportzonline.site>>","spotidownloader.com","ssdownloader.online","standardmedia.co.ke","stealthoptional.com","stormininnorman.com","storynavigation.com","stoutbluedevils.com","stream.offidocs.com","stream.pkayprek.com","streamadblockplus.*","streamcasthub.store","streamshunters.eu>>","streamtapeadblock.*","summarynetworks.com","supermotojunkie.com","susanexpectcare.com","suzukiatvforums.com","svetatnazdraveto.bg","sweetadult-tube.com","tainio-mania.online","tamilfreemp3songs.*","tapewithadblock.org","teachersupdates.net","technicalline.store","techtrendmakers.com","tekniikanmaailma.fi","telecharger-igli4.*","theberserkmanga.com","theboltonnews.co.uk","thecrazytourist.com","thedailyjournal.com","theglobeandmail.com","themehospital.co.uk","thenorthwestern.com","theoaklandpress.com","therecordherald.com","thesaltysoldier.com","thesimsresource.com","thesmokingcuban.com","thewatchseries.live","throwsmallstone.com","timesnowmarathi.com","timesrecordnews.com","timmaybealready.com","tiz-cycling-live.io","tophentaicomics.com","toptenknowledge.com","totalfuckmovies.com","totalmaturefuck.com","transexuales.gratis","travel-bookmark.net","trendsderzukunft.de","tubepornclassic.com","tubevintageporn.com","turkishseriestv.net","turtleboysports.com","tutorialsduniya.com","tw-hkt.blogspot.com","ukmagazinesfree.com","uktvplay.uktv.co.uk","ultimate-guitar.com","usinger-anzeiger.de","utahstateaggies.com","valleyofthesuns.com","veryfastdownload.pw","vickisaveworker.com","vinylcollective.com","vip.stream101.space","virtual-youtuber.jp","virtualdinerbot.com","vitadacelebrita.com","wallpaperaccess.com","watch-movies.com.pk","watchlostonline.net","watchmonkonline.com","watchmoviesrulz.com","watchonlinemovie.pk","wearesunderland.com","webhostingoffer.org","weneverbeenfree.com","weristdeinfreund.de","windows-7-forum.net","winit.heatworld.com","witneygazette.co.uk","woffordterriers.com","worcesternews.co.uk","worldstarhiphop.com","worldtravelling.com","www.cambe.pr.gov.br","www2.tmyinsight.net","xhamsterdeutsch.xyz","xn--nbkw38mlu2a.com","xnxx-downloader.net","xnxx-sex-videos.com","xxxhentaimovies.com","xxxpussysextube.com","xxxsexyjapanese.com","yellowblissroad.com","yeovilexpress.co.uk","yorkshirelife.co.uk","your-daily-girl.com","youramateurporn.com","youramateurtube.com","yourlifeupdated.net","youtubedownloader.*","zeeplayer.pages.dev","25yearslatersite.com","27-sidefire-blog.com","2adultflashgames.com","acienciasgalilei.com","adult-sex-gamess.com","adultdvdparadise.com","akatsuki-no-yona.com","allcelebritywiki.com","allcivilstandard.com","allnewindianporn.com","aman-dn.blogspot.com","amateurebonypics.com","amateuryoungpics.com","analysis-chess.io.vn","androidapkmodpro.com","androidauthority.com","androidtunado.com.br","angolopsicologia.com","animalextremesex.com","apenasmaisumyaoi.com","aquiyahorajuegos.net","aroundthefoghorn.com","aspdotnet-suresh.com","augustachronicle.com","ayobelajarbareng.com","ayrshire-today.co.uk","badassdownloader.com","bailiwickexpress.com","banglachotigolpo.xyz","bestmp3converter.com","bestshemaleclips.com","bigtitsporn-tube.com","birmingham-now.co.uk","blackwoodacademy.org","bloggingawaydebt.com","bloggingguidance.com","boainformacao.com.br","bogowieslowianscy.pl","bollywoodshaadis.com","boxofficebusiness.in","br.nacaodamusica.com","broncosportforum.com","browardpalmbeach.com","bucksfreepress.co.uk","bustyshemaleporn.com","cachevalleydaily.com","canberratimes.com.au","cartoonvideos247.com","centralboyssp.com.br","centralfifetimes.com","charlestoughrace.com","chasingthedonkey.com","cienagamagdalena.com","climbingtalshill.com","comandotorrenthd.org","commercialappeal.com","coolmath4parents.com","crackstreamsfree.com","crackstreamshd.click","craigretailers.co.uk","creators.nafezly.com","cumnockchronicle.com","dailygrindonline.net","dairylandexpress.com","davidsonbuilders.com","decorativemodels.com","defienietlynotme.com","deliciousmagazine.pl","demonyslowianskie.pl","derbyshirelife.co.uk","derricknationtop.com","descargaseriestv.com","diglink.blogspot.com","divxfilmeonline.tv>>","djsofchhattisgarh.in","docs.fingerprint.com","donna-cerca-uomo.com","dorsetmagazine.co.uk","downloadfilm.website","dunfermlinepress.com","durhamopenhouses.com","ear-phone-review.com","earnfromarticles.com","edivaldobrito.com.br","educationbluesky.com","embed.hideiframe.com","encuentratutarea.com","eroticteensphoto.net","escort-in-italia.com","essen-und-trinken.de","eurostreaming.casino","eveshamjournal.co.uk","exmouthjournal.co.uk","extremereportbot.com","fairforexbrokers.com","falmouthpacket.co.uk","famosas-desnudas.org","fastpeoplesearch.com","filmeserialegratis.*","filmpornofrancais.fr","finanznachrichten.de","finding-camellia.com","fle-5r8dchma-moo.com","footballandress.club","foreverconscious.com","forexwikitrading.com","forge.plebmasters.de","forobasketcatala.com","forum.lolesporte.com","forum.thresholdx.net","fotbolltransfers.com","fr.streamon-sport.ru","free-sms-receive.com","freebigboobsporn.com","freelistenonline.com","freemagazinespdf.com","freemedicalbooks.org","freepatternsarea.com","freereadnovel.online","freeromsdownload.com","freestreams-live.*>>","freethailottery.live","freshshemaleporn.com","fullywatchonline.com","funeral-memorial.com","gaget.hatenablog.com","games.abqjournal.com","games.dallasnews.com","games.denverpost.com","games.kansascity.com","games.sixtyandme.com","games.wordgenius.com","gardeningknowhow.com","gearingcommander.com","getfreesmsnumber.com","ghajini-4urg44yg.lol","giuseppegravante.com","giveawayoftheday.com","givemenbastreams.com","googledrivelinks.com","gourmetsupremacy.com","greatestshemales.com","greenvilleonline.com","griffinathletics.com","hackingwithreact.com","hackneygazette.co.uk","hampshire-life.co.uk","hds-streaming-hd.com","headlinepolitics.com","heartofvicksburg.com","heartrainbowblog.com","heartsstandard.co.uk","heresyoursavings.com","hexham-courant.co.uk","highheelstrample.com","historichorizons.com","hodgepodgehippie.com","hofheimer-zeitung.de","home-made-videos.com","homehobbiesdaily.com","homestratosphere.com","hostingreviews24.com","hotasianpussysex.com","hotjapaneseshows.com","huffingtonpost.co.uk","hypelifemagazine.com","igualdad.iaa.csic.es","ilfordrecorder.co.uk","immobilienscout24.de","india.marathinewz.in","inkworldmagazine.com","intereseducation.com","irresistiblepets.net","italiadascoprire.net","itpassportgokaku.com","jemontremonminou.com","jessicayeahcatch.com","jlwranglerforums.com","johnbeyondnation.com","k-stateathletics.com","kachelmannwetter.com","karaoke4download.com","karaokegratis.com.ar","lacronicabadajoz.com","lancashirelife.co.uk","laopiniondemalaga.es","laopiniondemurcia.es","laopiniondezamora.es","largescaleforums.com","latinatemptation.com","laweducationinfo.com","lazytranslations.com","lemonsqueezyhome.com","lempaala.ideapark.fi","lesbianvideotube.com","letemsvetemapplem.eu","letsworkremotely.com","link.djbassking.live","linksdegrupos.com.br","live-tv-channels.org","liveonlinesports.net","lostcoastoutpost.com","luxurydreamhomes.net","main.sportswordz.com","malverngazette.co.uk","mangcapquangvnpt.com","maps.blitzortung.org","maryspecialwatch.com","maturepornjungle.com","maturewomenfucks.com","mauiinvitational.com","medicalstudyzone.com","mein-kummerkasten.de","milforddailynews.com","milfordmercury.co.uk","mkvmoviespoint.autos","monkeyanimalporn.com","morganhillwebcam.com","motorbikecatalog.com","motorcitybengals.com","motorsport-total.com","movieloversworld.com","moviemakeronline.com","moviesubtitles.click","mujeresdesnudas.club","mustardseedmoney.com","mylivewallpapers.com","mypace.sasapurin.com","myperfectweather.com","mypussydischarge.com","myuploadedpremium.de","naughtymachinima.com","newfreelancespot.com","newhamrecorder.co.uk","newsonthegotoday.com","nibelungen-kurier.de","northernfarmer.co.uk","notebookcheck-ru.com","notebookcheck-tr.com","nudeplayboygirls.com","nuovo.vidplayer.live","nutraingredients.com","nylonstockingsex.net","odkrywamyzakryte.com","onechicagocenter.com","online-xxxmovies.com","onlinegrannyporn.com","originalteentube.com","pandadevelopment.net","pasadenastarnews.com","pcgamez-download.com","peeblesshirenews.com","pesprofessionals.com","pipocamoderna.com.br","plagiarismchecker.co","planetaminecraft.com","platform.twitter.com","play.doramasplus.net","player.amperwave.net","player.smashy.stream","playstationhaber.com","popularmechanics.com","porlalibreportal.com","pornhub-sexfilme.net","portnassauwebcam.com","presentation-ppt.com","prismmarketingco.com","pro.iqsmartgames.com","psychologyjunkie.com","pussymaturephoto.com","radiocountrylive.com","ragnarokscanlation.*","readcomicsonline.lol","redensarten-index.de","relogioonline.com.br","remotejobzone.online","reviewingthebrew.com","rhein-main-presse.de","rinconpsicologia.com","rockpapershotgun.com","roemische-zahlen.net","rojadirectaenvivo.pl","roms-telecharger.com","salamanca24horas.com","sanadegreecollege.in","sarkariresult.social","savespendsplurge.com","schoolgirls-asia.org","schwaebische-post.de","scoutmotorsforum.com","search.rakuten.co.jp","securegames.iwin.com","server-tutorials.net","sexypornpictures.org","sidmouthherald.co.uk","silveradoevforum.com","slateownersforum.com","sloughobserver.co.uk","socialmediagirls.com","socket.pearsoned.com","solomaxlevelnewbie.*","southbendtribune.com","spicyvintageporn.com","sportstohfa.online>>","springfieldforum.com","starkroboticsfrc.com","statesmanjournal.com","steamunderground.net","stevenfamilyedge.com","stream.nbcsports.com","streamingcommunity.*","strtapewithadblock.*","sudburymercury.co.uk","superfastrelease.xyz","superpackpormega.com","swietaslowianskie.pl","switchbacktravel.com","tainguyenmienphi.com","tasteandtellblog.com","telephone-soudan.com","teluguonlinemovies.*","telugusexkathalu.com","the-daily-record.com","thedailyreporter.com","thefappeningblog.com","thefastlaneforum.com","thegatewaypundit.com","thekitchenmagpie.com","theleafchronicle.com","theoldhamtimes.co.uk","thepublicopinion.com","thescottishsun.co.uk","thesimplifydaily.com","tienichdienthoai.net","tinyqualityhomes.org","tomb-raider-king.com","totalsportek1000.com","toyoheadquarters.com","tracylocalschool.com","trueachievements.com","tutorialforlinux.com","udemy-downloader.com","unblockedgames.world","underground.tboys.ro","utahsweetsavings.com","utepminermaniacs.com","ver-comics-porno.com","ver-mangas-porno.com","videoszoofiliahd.com","vintageporntubes.com","viralviralvideos.com","virgo-horoscopes.com","visualcapitalist.com","wallstreet-online.de","watchallchannels.com","watchcartoononline.*","watchgameofthrones.*","watchsuitsonline.net","watchtheofficetv.com","web.core.windows.net","weekendletters.store","wegotthiscovered.com","weihnachts-filme.com","wetasiancreampie.com","whats-on-netflix.com","whitehavennews.co.uk","wife-home-videos.com","wiltshiretimes.co.uk","wirtualnynowydwor.pl","worldgirlsportal.com","yakyufan-asobiba.com","youfreepornotube.com","youngerasiangirl.net","yourhomemadetube.com","youtube-nocookie.com","yummytummyaarthi.com","zakupy-czterykaty.pl","1337x.ninjaproxy1.com","3dassetcollection.com","3dprintersforum.co.uk","ableitungsrechner.net","abogadosrosarinos.com","ad-itech.blogspot.com","airportseirosafar.com","airsoftmilsimnews.com","allgemeine-zeitung.de","ar-atech.blogspot.com","arabamob.blogspot.com","arrisalah-jakarta.com","avene-hebergement.com","banglachoti-story.com","bestsellerforaday.com","bibliotecadecorte.com","bigbuttshubvideos.com","blackchubbymovies.com","blackmaturevideos.com","blasianluvforever.com","blog.motionisland.com","bournemouthecho.co.uk","branditechture.agency","brandstofprijzen.info","broncathleticfund.com","brutalanimalsfuck.com","bucetaspeludas.com.br","business-standard.com","calculator-online.net","cancer-horoscopes.com","cantondailyledger.com","celebritydeeplink.com","charlessheimprove.com","chesterstandard.co.uk","client.falixnodes.net","comentariodetexto.com","coolmath4teachers.com","cotswoldjournal.co.uk","courierpostonline.com","course-downloader.com","daddylivestream.com>>","dailyvideoreports.net","davescomputertips.com","desitab69.sextgem.com","desmoinesregister.com","destakenewsgospel.com","deutschpersischtv.com","diarioinformacion.com","diplomaexamcorner.com","dirtyyoungbitches.com","disneyfashionista.com","download.yasir252.com","downloadcursos.gratis","dragontranslation.com","dragontranslation.net","dragontranslation.org","dunmowbroadcast.co.uk","easyworldbusiness.com","edc1014070.pixnet.net","elcriticodelatele.com","electricalstudent.com","ellwoodcityledger.com","embraceinnerchaos.com","envato-downloader.com","eroticmoviesonline.me","errotica-archives.com","essexcountynews.co.uk","exchangeandmart.co.uk","expressilustrowany.pl","filemoon-59t9ep5j.xyz","filemoon-nv2xl8an.xyz","filmpornoitaliano.org","fitting-it-all-in.com","foodsdictionary.co.il","forestryjournal.co.uk","free-3dtextureshd.com","free-famous-toons.com","freebulksmsonline.com","freefatpornmovies.com","freeindiansextube.com","freepikdownloader.com","freepressseries.co.uk","freshmaturespussy.com","friedrichshainblog.de","froheweihnachten.info","gadgetguideonline.com","games.bostonglobe.com","games.centredaily.com","games.dailymail.co.uk","games.greatergood.com","games.miamiherald.com","games.puzzlebaron.com","games.startribune.com","games.theadvocate.com","games.theolympian.com","games.triviatoday.com","gbadamud.blogspot.com","gemini-horoscopes.com","generalpornmovies.com","gentiluomodigitale.it","gentlemansgazette.com","giantshemalecocks.com","giessener-anzeiger.de","girlfuckgalleries.com","glamourxxx-online.com","gmuender-tagespost.de","googlearth.selva.name","goprincetontigers.com","greatfallstribune.com","guardian-series.co.uk","hackedonlinegames.com","halsteadgazette.co.uk","heraldtimesonline.com","hersfelder-zeitung.de","hillingdontimes.co.uk","hochheimer-zeitung.de","hoegel-textildruck.de","hollywoodreporter.com","hot-teens-movies.mobi","hotmarathistories.com","howtoblogformoney.net","html5.gamemonetize.co","hungarianhardstyle.hu","iamflorianschulze.com","impartialreporter.com","indiansexstories2.net","indratranslations.com","inmatesearchidaho.com","insideeducation.co.za","jacquieetmicheltv.net","jemontremasextape.com","jessicachoosemake.com","journaldemontreal.com","journey.to-travel.net","jsugamecocksports.com","juninhoscripts.com.br","kana-mari-shokudo.com","kstatewomenshoops.com","kstatewomenshoops.net","kstatewomenshoops.org","labelandnarrowweb.com","lapaginadealberto.com","learnodo-newtonic.com","lebensmittelpraxis.de","ledburyreporter.co.uk","lesbianfantasyxxx.com","lingeriefuckvideo.com","live-sport.duktek.pro","lycomingathletics.com","majalahpendidikan.com","malaysianwireless.com","mangaplus.shueisha.tv","mavericktruckclub.com","megashare-website.com","meuplayeronlinehd.com","midlandstraveller.com","midwestconference.org","mimaletadepeliculas.*","mmoovvfr.cloudfree.jp","musvozimbabwenews.com","mysflink.blogspot.com","nationalgeographic.fr","netsentertainment.net","nobledicion.yoveo.xyz","note.sieuthuthuat.com","notformembersonly.com","oberschwaben-tipps.de","onepiecemangafree.com","onlinetntextbooks.com","onlinewatchmoviespk.*","ovcdigitalnetwork.com","paradiseislandcam.com","partner.nonamejose.sx","pcmap.place.naver.com","pcso-lottoresults.com","peiner-nachrichten.de","pelotalibrevivo.net>>","philippinenmagazin.de","photovoltaikforum.com","pisces-horoscopes.com","platform.adex.network","portbermudawebcam.com","primapaginamarsala.it","printablecreative.com","prod.hydra.sophos.com","providencejournal.com","quinnipiacbobcats.com","qul-de.translate.goog","radioitaliacanada.com","radioitalianmusic.com","redbluffdailynews.com","reddit-streams.online","redheaddeepthroat.com","redirect.dafontvn.com","revistaapolice.com.br","romfordrecorder.co.uk","salzgitter-zeitung.de","santacruzsentinel.com","santafenewmexican.com","scotlandrugbynews.com","scriptgrowagarden.com","scrubson.blogspot.com","scrumpoker-online.org","sex-amateur-clips.com","sexybabespictures.com","shortgoo.blogspot.com","showdownforrelief.com","silveradocheyenne.org","sinnerclownceviri.net","skorpion-horoskop.com","smartcarofamerica.com","smartwebsolutions.org","snapinstadownload.xyz","snowboardingforum.com","softwarecrackguru.com","softwaredescargas.com","solomax-levelnewbie.*","solopornoitaliani.xxx","sonymobilityforum.com","southsideshowdown.com","southwalesargus.co.uk","southwestfarmer.co.uk","soziologie-politik.de","space.tribuntekno.com","sport.elwatannews.com","stablediffusionxl.com","startupjobsportal.com","steamcrackedgames.com","stourbridgenews.co.uk","stratolinerdeluxe.com","stream.hownetwork.xyz","streaming-community.*","streamingcommunityz.*","studyinghuman6js.shop","supertelevisionhd.com","survivalistboards.com","sweet-maturewomen.com","symboleslowianskie.pl","tapeadvertisement.com","tarjetarojaenvivo.lat","tarjetarojatvonline.*","taurus-horoscopes.com","taurus.topmanhuas.org","tech.trendingword.com","texteditor.nsspot.net","thecakeboutiquect.com","thedigitaltheater.com","thefightingcock.co.uk","thefreedictionary.com","thegnomishgazette.com","thenews-messenger.com","thenorthernecho.co.uk","theprofoundreport.com","thesavvyexplorers.com","thetruthaboutcars.com","thewebsitesbridge.com","thisiswiltshire.co.uk","thurrockgazette.co.uk","timesheraldonline.com","timesnewsgroup.com.au","torrentdofilmeshd.net","towheaddeepthroat.com","travel-the-states.com","tudo-para-android.com","ukiahdailyjournal.com","unsurcoenlasombra.com","vdl.np-downloader.com","virtualstudybrain.com","visaliatimesdelta.com","voyeur-pornvideos.com","walterprettytheir.com","watch-movies.com.pk>>","watch.foodnetwork.com","watchcartoonsonline.*","watchfreejavonline.co","watchkobestreams.info","watchonlinemoviespk.*","watchporninpublic.com","watchseriesstream.com","watfordobserver.co.uk","wausaudailyherald.com","weihnachts-bilder.org","wetterauer-zeitung.de","whisperingauroras.com","whittierdailynews.com","wiesbadener-kurier.de","wirtualnelegionowo.pl","wisbechstandard.co.uk","worldwidestandard.net","www.bankofamerica.com","www.dailymotion.com>>","xn--mlaregvle-02af.nu","yoima.hatenadiary.com","yoima2.hatenablog.com","zone-telechargement.*","123movies-official.net","1plus1plus1equals1.net","45er-de.translate.goog","acervodaputaria.com.br","adelaidepawnbroker.com","aimasummd.blog.fc2.com","algodaodocescan.com.br","allevertakstream.space","androidecuatoriano.xyz","appstore-discounts.com","arbitrarydecisions.com","arianathankspecial.com","automobile-catalog.com","batterypoweronline.com","best4hack.blogspot.com","bestialitysextaboo.com","bicesteradvertiser.net","blackamateursnaked.com","borehamwoodtimes.co.uk","brunettedeepthroat.com","canadianunderwriter.ca","canzoni-per-bambini.it","cartoonporncomics.info","caseyimpactstation.com","celebritymovieblog.com","chillicothegazette.com","clixwarez.blogspot.com","cloudorchestranova.com","comandotorrentshds.org","conceptoweb-studio.com","cosmonova-broadcast.tv","cotravinh.blogspot.com","cpopchanelofficial.com","currencyconverterx.com","currentrecruitment.com","dads-banging-teens.com","databasegdriveplayer.*","digitalbeautybabes.com","digitalcameraworld.com","discover.futureplc.com","downloadfreecourse.com","drakorkita73.kita.rest","drop.carbikenation.com","dtupgames.blogspot.com","eastlothiancourier.com","ecommercewebsite.store","einewelteinezukunft.de","electriciansforums.net","elektrobike-online.com","elizabeth-mitchell.org","enciclopediaonline.com","eu-proxy.startpage.com","eurointegration.com.ua","exclusiveasianporn.com","exgirlfriendmarket.com","ezaudiobookforsoul.com","f150lightningforum.com","fantasticyoungporn.com","filmeserialeonline.org","freelancerartistry.com","freepic-downloader.com","freepik-downloader.com","ftlauderdalewebcam.com","games.besthealthmag.ca","games.heraldonline.com","games.islandpacket.com","games.journal-news.com","games.readersdigest.ca","garylargeavailable.com","gazetteandherald.co.uk","gdl.freegogpcgames.xyz","gifhorner-rundschau.de","girlfriendsexphoto.com","golink.bloggerishyt.in","greatbritishlife.co.uk","hentai-cosplay-xxx.com","hentai-vl.blogspot.com","hiraethtranslation.com","hockeyfantasytools.com","hopsion-consulting.com","hotanimepornvideos.com","housethathankbuilt.com","illustratemagazine.com","imagetwist.netlify.app","incontri-in-italia.com","indianpornvideo.online","insidekstatesports.com","insidekstatesports.net","insidekstatesports.org","irasutoya.blogspot.com","islingtongazette.co.uk","jacquieetmicheltv2.net","jamespatterncamera.com","jeepgladiatorforum.com","juegos.eleconomista.es","juneauharborwebcam.com","k-statewomenshoops.com","k-statewomenshoops.net","k-statewomenshoops.org","kenkou-maintenance.com","kristiesoundsimply.com","lagacetadesalamanca.es","lecourrier-du-soir.com","links.totalsportekl.is","livefootballempire.com","living-magazines.co.uk","livingincebuforums.com","llanfairpwllgwyngy.com","lonestarconference.org","lowestoftjournal.co.uk","ludlowadvertiser.co.uk","m.bloggingguidance.com","marissasharecareer.com","marketedgeofficial.com","marketplace.nvidia.com","masterpctutoriales.com","megadrive-emulator.com","megankiddifference.com","meteoregioneabruzzo.it","metrowestdailynews.com","mini.surveyenquete.net","moneywar2.blogspot.com","muleriderathletics.com","nathanmichaelphoto.com","newbookmarkingsite.com","news-journalonline.com","nicolehappyoutside.com","nilopolisonline.com.br","northnorfolknews.co.uk","obutecodanet.ig.com.br","onlinetechsamadhan.com","onlinevideoconverter.*","opiniones-empresas.com","oracleerpappsguide.com","originalindianporn.com","osint-info.netlify.app","paginadanoticia.com.br","palmbeachdailynews.com","pianetamountainbike.it","pittsburghpanthers.com","plagiarismdetector.net","play.discoveryplus.com","pontiacdailyleader.com","portstthomaswebcam.com","poweredbycovermore.com","praxis-jugendarbeit.de","principiaathletics.com","puzzles.standard.co.uk","puzzles.sunjournal.com","radioamericalatina.com","readingchronicle.co.uk","redlandsdailyfacts.com","repositoratacadao.cyou","republicain-lorrain.fr","rubyskitchenrecipes.uk","russkoevideoonline.com","salisburyjournal.co.uk","salmonfishingforum.com","saturnoutlookforum.net","schwarzwaelder-bote.de","scorpio-horoscopes.com","sexyasianteenspics.com","shannoncoldalready.com","smallpocketlibrary.com","smartfeecalculator.com","sms-receive-online.com","snowmobilefanatics.com","southendstandard.co.uk","strangernervousql.shop","streamhentaimovies.com","stuttgarter-zeitung.de","supermarioemulator.com","tastefullyeclectic.com","tatacommunications.com","techieway.blogspot.com","teluguhitsandflops.com","thatballsouttahere.com","the-military-guide.com","thecartoonporntube.com","thehouseofportable.com","thewestonmercury.co.uk","totalsportek1000.com>>","turkishaudiocenter.com","tutoganga.blogspot.com","tvchoicemagazine.co.uk","unity3diy.blogspot.com","universityequality.com","watchthematch.online>>","webcreator-journal.com","welsh-dictionary.ac.uk","westerntelegraph.co.uk","whitchurchherald.co.uk","xhamster-sexvideos.com","xn--algododoce-j5a.com","youfiles.herokuapp.com","yourdesignmagazine.com","zeeebatch.blogspot.com","aachener-nachrichten.de","adblockeronstreamtape.*","ads-ti9ni4.blogspot.com","adultgamescollector.com","allschoolboysecrets.com","andoveradvertiser.co.uk","aquarius-horoscopes.com","arcade.dailygazette.com","architecturaldigest.com","asianteenagefucking.com","auto-motor-und-sport.de","axutongxue.onrender.com","battlecreekenquirer.com","bestbondagevideos.com>>","bestpuzzlesandgames.com","betterbuttchallenge.com","bikyonyu-bijo-zukan.com","bridgwatermercury.co.uk","buerstaedter-zeitung.de","burlingtonfreepress.com","c--ix-de.translate.goog","careersatcouncil.com.au","claireguessthousand.com","cloudapps.herokuapp.com","columbiadailyherald.com","coolsoft.altervista.org","creditcardgenerator.com","currently.att.yahoo.com","dameungrrr.videoid.baby","destinationsjourney.com","dokuo666.blog98.fc2.com","dumbartonreporter.co.uk","edgedeliverynetwork.com","elperiodicodearagon.com","encurtador.postazap.com","entertainment-focus.com","escortconrecensione.com","eservice.directauto.com","eskiceviri.blogspot.com","examiner-enterprise.com","exclusiveindianporn.com","fantasysports.yahoo.com","fightforthealliance.com","financeandinsurance.xyz","footballtransfer.com.ua","fourchette-et-bikini.fr","freefiremaxofficial.com","freemovies-download.com","freepornhdonlinegay.com","funeralmemorialnews.com","gamersdiscussionhub.com","games.mercedsunstar.com","games.pressdemocrat.com","games.sanluisobispo.com","games.star-telegram.com","gamingsearchjournal.com","giessener-allgemeine.de","greenocktelegraph.co.uk","hattiesburgamerican.com","heatherwholeinvolve.com","historyofroyalwomen.com","homeschoolgiveaways.com","ilgeniodellostreaming.*","india.mplandrecord.info","influencersgonewild.com","insidekstatesports.info","integral-calculator.com","investmentwatchblog.com","iptvdroid1.blogspot.com","jefferycontrolmodel.com","juegosdetiempolibre.org","julieseatsandtreats.com","keysbrasil.blogspot.com","keywestharborwebcam.com","knutsfordguardian.co.uk","kutubistan.blogspot.com","lancewhosedifficult.com","lansingstatejournal.com","laurelberninteriors.com","legendaryrttextures.com","linklog.tiagorangel.com","lirik3satu.blogspot.com","loldewfwvwvwewefdw.cyou","matthewhotelscience.com","megaplayer.bokracdn.run","metamani.blog15.fc2.com","miltonfriedmancores.org","ministryofsolutions.com","mobile-tracker-free.com","mobileweb.bankmellat.ir","morrisvillemustangs.com","mountainbike-magazin.de","movielinkbdofficial.com","mrfreemium.blogspot.com","naumburger-tageblatt.de","newlifefuneralhomes.com","news-und-nachrichten.de","northwalespioneer.co.uk","northwichguardian.co.uk","nudeblackgirlfriend.com","nutraceuticalsworld.com","onlinesoccermanager.com","osteusfilmestuga.online","pamelachangemission.com","pandajogosgratis.com.br","paradehomeandgarden.com","patriotathleticfund.com","pcoptimizedsettings.com","pepperlivestream.online","phonenumber-lookup.info","player.bestrapeporn.com","player.smashystream.com","player.tormalayalamhd.*","player.xxxbestsites.com","portaldosreceptores.org","portcanaveralwebcam.com","portstmaartenwebcam.com","poughkeepsiejournal.com","pramejarab.blogspot.com","predominantlyorange.com","premierfantasytools.com","prepared-housewives.com","privateindianmovies.com","programmingeeksclub.com","publicopiniononline.com","puzzles.pressherald.com","rebeccacostthousand.com","rebeccapracticeloss.com","receive-sms-online.info","rppk13baru.blogspot.com","searchenginereports.net","seoul-station-druid.com","sexyteengirlfriends.net","sexywomeninlingerie.com","singlehoroskop-loewe.de","snowman-information.com","spacestation-online.com","sqlserveregitimleri.com","stevenspointjournal.com","stowmarketmercury.co.uk","streamtapeadblockuser.*","swindonadvertiser.co.uk","talentstareducation.com","teamupinternational.com","tech.pubghighdamage.com","the-voice-of-germany.de","thechroniclesofhome.com","thehappierhomemaker.com","theinternettaughtme.com","thescottishfarmer.co.uk","thisisoxfordshire.co.uk","tips97tech.blogspot.com","traderepublic.community","tutorialesdecalidad.com","valuable.hatenablog.com","verteleseriesonline.com","watchseries.unblocked.*","wiesbadener-tagblatt.de","wiltsglosstandard.co.uk","wimbledonguardian.co.uk","windowsaplicaciones.com","xxxjapaneseporntube.com","yourlocalguardian.co.uk","youtube4kdownloader.com","zonamarela.blogspot.com","zone-telechargement.ing","zoomtventertainment.com","720pxmovies.blogspot.com","abendzeitung-muenchen.de","advertiserandtimes.co.uk","afilmyhouse.blogspot.com","altebwsneno.blogspot.com","anime4mega-descargas.net","aspirapolveremigliori.it","ate60vs7zcjhsjo5qgv8.com","atlantichockeyonline.com","aussenwirtschaftslupe.de","basingstokegazette.co.uk","bestialitysexanimals.com","boundlessnecromancer.com","broadbottomvillage.co.uk","businesssoftwarehere.com","canonprintersdrivers.com","cardboardtranslation.com","celebrityleakednudes.com","childrenslibrarylady.com","cimbusinessevents.com.au","cle0desktop.blogspot.com","cloudcomputingtopics.net","culture-informatique.net","cybertruckownersclub.com","democratandchronicle.com","dictionary.cambridge.org","dictionnaire-medical.net","dominican-republic.co.il","downloads.wegomovies.com","downloadtwittervideo.com","dsocker1234.blogspot.com","einrichtungsbeispiele.de","ellenpoliticalfollow.com","enfieldindependent.co.uk","fid-gesundheitswissen.de","freegrannypornmovies.com","freehdinterracialporn.in","ftlauderdalebeachcam.com","futbolenlatelevision.com","galaxytranslations10.com","gamershit.altervista.org","games.crosswordgiant.com","games.idahostatesman.com","games.thenewstribune.com","games.tri-cityherald.com","gcertificationcourse.com","gelnhaeuser-tageblatt.de","general-anzeiger-bonn.de","greenbaypressgazette.com","hampshirechronicle.co.uk","hentaianimedownloads.com","hilfen-de.translate.goog","hormuz.data-tracking.net","hotmaturegirlfriends.com","inlovingmemoriesnews.com","inmatefindcalifornia.com","insurancebillpayment.net","intelligence-console.com","jacquieetmichelelite.com","jeanprofessorcentral.com","jennifereconomicgive.com","juegos.elnuevoherald.com","jumpmanclubbrasil.com.br","katherineschoolphone.com","lampertheimer-zeitung.de","largsandmillportnews.com","latribunadeautomocion.es","lauterbacher-anzeiger.de","lespassionsdechinouk.com","liveanimalporn.zooo.club","mansfieldnewsjournal.com","marshfieldnewsherald.com","mediapemersatubangsa.com","meine-anzeigenzeitung.de","mentalhealthcoaching.org","minecraft-serverlist.net","moalm-qudwa.blogspot.com","montgomeryadvertiser.com","my-code4you.blogspot.com","northsomersettimes.co.uk","nutraingredients-usa.com","nyangames.altervista.org","oberhessische-zeitung.de","onlinetv.planetfools.com","personality-database.com","philly.arkadiumarena.com","photos-public-domain.com","play.mercadolivre.com.br","player.subespanolvip.com","polseksongs.blogspot.com","portevergladeswebcam.com","programasvirtualespc.net","puzzles.centralmaine.com","quelleestladifference.fr","reddit-soccerstreams.com","redditchadvertiser.co.uk","renierassociatigroup.com","roadrunnersathletics.com","sandiegouniontribune.com","senaleszdhd.blogspot.com","shoppinglys.blogspot.com","smithandwessonforums.com","smotret-porno-onlain.com","socialanxietysupport.com","softdroid4u.blogspot.com","southwalesguardian.co.uk","stream.googleapiscdn.com","streetfighterv2forum.com","teresapoliticallearn.com","thebharatexpressnews.com","thedesigninspiration.com","therelaxedhomeschool.com","thunderousintentions.com","tirumalatirupatiyatra.in","tivysideadvertiser.co.uk","tricountyindependent.com","tubeinterracial-porn.com","unityassetcollection.com","upscaler.stockphotos.com","ustreasuryyieldcurve.com","verpeliculasporno.gratis","virginmediatelevision.ie","wandsworthguardian.co.uk","warringtonguardian.co.uk","watchdoctorwhoonline.com","watchtrailerparkboys.com","wharfedaleobserver.co.uk","workproductivityinfo.com","www.youtube-nocookie.com","z13.web.core.windows.net","actionviewphotography.com","arabic-robot.blogspot.com","blog.receivefreesms.co.uk","braunschweiger-zeitung.de","bucyrustelegraphforum.com","burlingtoncountytimes.com","businessnamegenerator.com","caroloportunidades.com.br","christopheruntilpoint.com","constructionplacement.org","convert-case.softbaba.com","cooldns-de.translate.goog","ctrmarketingsolutions.com","darumasushiantofagasta.cl","depo-program.blogspot.com","derivative-calculator.net","devere-group-hongkong.com","devoloperxda.blogspot.com","everydayhomeandgarden.com","fantasyfootballgeek.co.uk","fifties-beat.blogspot.com","fitnesshealtharticles.com","footballleagueworld.co.uk","fotografareindigitale.com","freeserverhostingweb.club","freewatchserialonline.com","game-kentang.blogspot.com","games.daytondailynews.com","games.gameshownetwork.com","games.lancasteronline.com","games.ledger-enquirer.com","games.moviestvnetwork.com","games.theportugalnews.com","gloucestershirelive.co.uk","koume-in-huistenbosch.net","krankheiten-simulieren.de","lancashiretelegraph.co.uk","lancastereaglegazette.com","latribunadelpaisvasco.com","mega-hentai2.blogspot.com","messengernewspapers.co.uk","monte-carlo-lab.pages.dev","northwaleschronicle.co.uk","nutraingredients-asia.com","oeffentlicher-dienst.info","oneessentialcommunity.com","onepiece-manga-online.net","passionatecarbloggers.com","percentagecalculator.guru","peterboroughmatters.co.uk","portclintonnewsherald.com","printedelectronicsnow.com","programmiedovetrovarli.it","projetomotog.blogspot.com","puzzles.independent.co.uk","realcanadiansuperstore.ca","receitasoncaseiras.online","sataniabatch.blogspot.com","schooltravelorganiser.com","scripcheck.great-site.net","searchmovie.wp.xdomain.jp","sentinelandenterprise.com","seogroup.bookmarking.info","silverpetticoatreview.com","softwaresolutionshere.com","sofwaremania.blogspot.com","storage.googleapiscdn.com","telenovelas-turcas.com.es","thebeginningaftertheend.*","transparentcalifornia.com","truesteamachievements.com","tucsitupdate.blogspot.com","ultimateninjablazingx.com","usahealthandlifestyle.com","vercanalesdominicanos.com","vintage-erotica-forum.com","whatisareverseauction.com","xn--k9ja7fb0161b5jtgfm.jp","youtubemp3donusturucu.net","yusepjaelani.blogspot.com","a-b-f-dd-aa-bb-cctwd3a.fun","a-b-f-dd-aa-bb-ccyh5my.fun","arena.gamesforthebrain.com","audiobookexchangeplace.com","avengerinator.blogspot.com","barefeetonthedashboard.com","barryanddistrictnews.co.uk","basseqwevewcewcewecwcw.xyz","bezpolitickekorektnosti.cz","bibliotecahermetica.com.br","bromsgroveadvertiser.co.uk","change-ta-vie-coaching.com","chelmsfordweeklynews.co.uk","collegefootballplayoff.com","cornerstoneconfessions.com","cotannualconference.org.uk","cuatrolatastv.blogspot.com","dinheirocursosdownload.com","downloads.sayrodigital.net","eastlondonadvertiser.co.uk","elperiodicoextremadura.com","eppingforestguardian.co.uk","flashplayer.fullstacks.net","former-railroad-worker.com","frankfurter-wochenblatt.de","funnymadworld.blogspot.com","games.bellinghamherald.com","games.everythingzoomer.com","greatyarmouthmercury.co.uk","helmstedter-nachrichten.de","html5.gamedistribution.com","interestingengineering.com","investigationdiscovery.com","istanbulescortnetworks.com","jilliandescribecompany.com","johnwardflighttraining.com","kidderminstershuttle.co.uk","mailtool-de.translate.goog","marvelousact.hatenablog.jp","motive213link.blogspot.com","musicbusinessworldwide.com","noticias.gospelmais.com.br","nutraingredients-latam.com","photoshopvideotutorial.com","puzzles.bestforpuzzles.com","recetas.arrozconleche.info","redditsoccerstreams.name>>","ripleyfieldworktracker.com","riverdesdelatribuna.com.ar","sagittarius-horoscopes.com","stroudnewsandjournal.co.uk","stuttgarter-nachrichten.de","sulocale.sulopachinews.com","thelastgamestandingexp.com","thetelegraphandargus.co.uk","tiendaenlinea.claro.com.ni","todoseriales1.blogspot.com","tokoasrimotedanpayet.my.id","tralhasvarias.blogspot.com","watchimpracticaljokers.com","whowantstuffs.blogspot.com","windowcleaningforums.co.uk","wisconsinrapidstribune.com","wolfenbuetteler-zeitung.de","wolfsburger-nachrichten.de","buckscountycouriertimes.com","celestialtributesonline.com","chardandilminsternews.co.uk","charlottepilgrimagetour.com","choose.kaiserpermanente.org","cloud-computing-central.com","cointiply.arkadiumarena.com","constructionmethodology.com","cool--web-de.translate.goog","denbighshirefreepress.co.uk","domainregistrationtips.info","download.kingtecnologia.com","dramakrsubindo.blogspot.com","elperiodicomediterraneo.com","embed.nextgencloudtools.com","evlenmekisteyenbayanlar.net","flash-firmware.blogspot.com","games.myrtlebeachonline.com","ge-map-overlays.appspot.com","happypenguin.altervista.org","helensburghadvertiser.co.uk","iphonechecker.herokuapp.com","kathyinformationwhether.com","littlepandatranslations.com","lurdchinexgist.blogspot.com","newssokuhou666.blog.fc2.com","optionsprofitcalculator.com","parametric-architecture.com","pasatiemposparaimprimir.com","practicalpainmanagement.com","puzzles.crosswordsolver.org","redcarpet-fashionawards.com","redhillandreigatelife.co.uk","richardquestionbuilding.com","runcornandwidnesworld.co.uk","rupertisdivingintoocean.com","saffronwaldenreporter.co.uk","somersetcountygazette.co.uk","sztucznainteligencjablog.pl","thewestmorlandgazette.co.uk","timesofindia.indiatimes.com","watchfootballhighlights.com","watchmalcolminthemiddle.com","watchonlyfoolsandhorses.com","your-local-pest-control.com","zanesvilletimesrecorder.com","barkinganddagenhampost.co.uk","centrocommercialevulcano.com","conoscereilrischioclinico.it","correction-livre-scolaire.fr","economictimes.indiatimes.com","emperorscan.mundoalterno.org","games.springfieldnewssun.com","gps--cache-de.translate.goog","imagenesderopaparaperros.com","lizs-early-learning-spot.com","locurainformaticadigital.com","michiganrugcleaning.cleaning","mimaletamusical.blogspot.com","net--tools-de.translate.goog","net--tours-de.translate.goog","pekalongan-cits.blogspot.com","publicrecords.netronline.com","skibiditoilet.yourmom.eu.org","springfieldspringfield.co.uk","teachersguidetn.blogspot.com","tekken8combo.kagewebsite.com","theeminenceinshadowmanga.com","watchonlinemovies.vercel.app","wattonandswaffhamtimes.co.uk","www-daftarharga.blogspot.com","xn--90afacv0cu2a3cr.xn--p1ai","youkaiwatch2345.blog.fc2.com","bayaningfilipino.blogspot.com","beautypageants.indiatimes.com","becclesandbungayjournal.co.uk","braintreeandwithamtimes.co.uk","counterstrike-hack.leforum.eu","dev-dark-blog.pantheonsite.io","dumfriesandgallowaylife.co.uk","educationtips213.blogspot.com","fun--seiten-de.translate.goog","hortonanderfarom.blogspot.com","jeremyparticipantanything.com","panlasangpinoymeatrecipes.com","pharmaceutical-technology.com","play.virginmediatelevision.ie","pressurewasherpumpdiagram.com","thefreedommatrix.blogspot.com","thetfordandbrandontimes.co.uk","thetottenhamindependent.co.uk","walkthrough-indo.blogspot.com","web--spiele-de.translate.goog","wojtekczytawh40k.blogspot.com","bordercountiesadvertizer.co.uk","caq21harderv991gpluralplay.xyz","clactonandfrintongazette.co.uk","comousarzararadio.blogspot.com","coolsoftware-de.translate.goog","hipsteralcolico.altervista.org","kryptografie-de.translate.goog","maldonandburnhamstandard.co.uk","mp3songsdownloadf.blogspot.com","noicetranslations.blogspot.com","oxfordlearnersdictionaries.com","pengantartidurkuh.blogspot.com","photo--alben-de.translate.goog","readgraphicnovels.blogspot.com","rheinische-anzeigenblaetter.de","thelibrarydigital.blogspot.com","touhoudougamatome.blog.fc2.com","watchcalifornicationonline.com","wwwfotografgotlin.blogspot.com","bitcoinminingforex.blogspot.com","cool--domains-de.translate.goog","ibecamethewifeofthemalelead.com","pickcrackpasswords.blogspot.com","posturecorrectorshop-online.com","safeframe.googlesyndication.com","sozialversicherung-kompetent.de","utilidades.ecuadjsradiocorp.com","xn--90afacv0clj6ac0dxa.xn--p1ai","akihabarahitorigurasiseikatu.com","darlingtonandstocktontimes.co.uk","deletedspeedstreams.blogspot.com","freesoftpdfdownload.blogspot.com","games.games.newsgames.parade.com","insuranceloan.akbastiloantips.in","richmondandtwickenhamtimes.co.uk","situsberita2terbaru.blogspot.com","such--maschine-de.translate.goog","games.charlottegames.cnhinews.com","loadsamusicsarchives.blogspot.com","pythonmatplotlibtips.blogspot.com","ragnarokscanlation.opchapters.com","taiwanlibrarysearch.herokuapp.com","tw.xn--h9jepie9n6a5394exeq51z.com","hollywoodhinditracks2.blogspot.com","papagiovannipaoloii.altervista.org","softwareengineer-de.translate.goog","harwichandmanningtreestandard.co.uk","jyankuotakarakanteidan.blogspot.com","rojadirecta-tv-en-vivo.blogspot.com","thenightwithoutthedawn.blogspot.com","burnhamandhighbridgeweeklynews.co.uk","tenseishitaraslimedattaken-manga.com","wetter--vorhersage-de.translate.goog","ngsingleissues.nationalgeographic.com","wymondhamandattleboroughmercury.co.uk","marketing-business-revenus-internet.fr","hardware--entwicklung-de.translate.goog","xn--n8jwbyc5ezgnfpeyd3i0a3ow693bw65a.com","sharpen-free-design-generator.netlify.app","a-b-c-d-e-f9jeats0w5hf22jbbxcrpnq37qq6nbxjwypsy.fun","xn-----0b4asja7ccgu2b4b0gd0edbjm2jpa1b1e9zva7a0347s4da2797e8qri.xn--1ck2e1b"];
    const collectArglistRefIndices = (out, hn, r) => {
        let l = 0, i = 0, d = 0;
        let candidate = '';
        while ( l < r ) {
            i = l + r >>> 1;
            candidate = scriptletHostnames[i];
            d = hn.length - candidate.length;
            if ( d === 0 ) {
                if ( hn === candidate ) {
                    out.add(i); break;
                }
                d = hn < candidate ? -1 : 1;
            }
            if ( d < 0 ) {
                r = i;
            } else {
                l = i + 1;
            }
        }
        return i + 1;
    };
    const indicesFromHostname = (out, hnDetails, suffix = '') => {
        if ( hnDetails.hns.length === 0 ) { return; }
        let r = scriptletHostnames.length;
        for ( const hn of hnDetails.hns ) {
            r = collectArglistRefIndices(out, `${hn}${suffix}`, r);
        }
        if ( $hasEntities$ ) {
            let r = scriptletHostnames.length;
            for ( const en of hnDetails.ens ) {
                r = collectArglistRefIndices(out, `${en}${suffix}`, r);
            }
        }
    };
    const todoIndices = new Set();
    indicesFromHostname(todoIndices, scriptletGlobals.origins[0]);
    if ( $hasAncestors$ ) {
        for ( const entry of scriptletGlobals.origins ) {
            if ( entry.i === 0 ) { continue; }
            indicesFromHostname(todoIndices, entry, '>>');
        }
    }
    // Collect arglist references
    if ( todoIndices.size ) {
        const arglistRefs = /* 13944 */ ["1455","59","663,1366","1364","122","1176","73","3657","113,264","73,123","2605","15,123,139,430,760,761","1312","766,1785","1366","933,2191,2192","73,139,462,3318","1367,1861","1312","73,1124","1312","1312","1312","2441","-74","3072,3073","42,149,157,963,1663","76,2384,2385","59,149","1620","1005","204,1368","1312","689","1779","85,1312,1467","122","174,761,825","581","1312","1312","1312","-2431,-2435,-2436,2441","1312","2676,2677,2678,2679,2680,3550,3551,3552,3553","73","42,73,96,100,101,102,103,1366","123,631,632,633,634,635,636","1312","2628","663","42","1364","123,367","4016,4017","320","2876","3916,4061","1366","663","1555","42,73,123,1368","39","324,3669","73,2056","122","67","75,122","67,96,231,467","83,324","123,1605","1629,1630,1631","386,3750","1124","268","3960,3961","3566","663","28","1312","73","73,88,663,1367,1502,1503","3665,3950","123,139,430,851,1365","3231","73,149","73,430,852","31,42,73","275,367","1312","39","608,925","65,216,358,1455,3700","2416","1000,-3674","1312","73","963,1369","1312","59,67,123,173,430,1033","122","58,963,1385","3776,3777","3980,3981","2151","3142","1385","307,1387","307,963,3356,3357,3358,3359,3360,3361","1176","1367,1861","1493,3191","1367,1861","1370,2532","65","4063,4064","799,3231","14,3460","1312","330","75","15,149","73,709","1912","3998,3999,4000","39","1312","1552","324","324","1312","1553","1312","1000,-3674","73,3382","1312","73,123,663,1200,1201","73,123,324,1175,1176,1177,1178,1179","268","59,67,123","1367","42,59,302","73,96,1176","471","1312","73","4080","1556,1557","1312","2535","123","931,1312,2265","1312","73,219,963,1385","403","3502","1312","1056","42,114,144","1312","1455","924","842","1176","663","1779,1780","1368","1790","73,123,324,1175,1176,1177,1178,1179","934","1879","1312","788,1323","15,-16,42,73,427","73,1233","663","1312","2539","73,219,963,1385","713,1312","216","73,462,478,1822,2329","1312","3699","933","1893,1894,1895,1896","283","248","73,367,2204","73","1206,1292,1293,1294,1295,1296,1297,1298,1299,1300","73,88","2756","42,495","67","122","1124","2840","570,3970,4013","2803","127","502","766,1010","1462","890","1368","59,73,123,218,263","808,846,1124,2312","115","268","68,663,2402","73","451","766,1091,1368,1934","73,2798","1247","1432","663","150","1456","3664","4046","1455","3170","35,36,37","88,89","3557","268,298,1334","47","324,1438,1439,2114","1916,2718","11,930,1312","385,2117","67","2571,2572,2573,2574,2575,2576,3592,3595","3971","3355","83","4029","3283","1583,1722","1312","268,1385","3960,3961","1455","1795","2853","2070","2081,2214,2279","1432","1035","73,88,1502,1503","73","53,270,488,489","1104","31","73,123,139,430,851,1365","123,849,850,1366","3518","1153","48","1124","1366","2977","83,2142,2143","129,286","39,1312","39,65,216,291,3700","907","67,171,663,1176","928,1312","1000,-3674","1328","73,984,1365","1176","73,443,1365","268,935,2046","1366","1000,-3674","996","1000,-3674","232","1455","42,59,172,302,517","862","1312","122","1439","1124","73,2767","1124","221,268,1385","268","1469","809","809","809","268","1385","4020","73,296,914","241","90,769","2871","766,1290,1934","2876,3210","3841,3842","124","42,124,149","2832,2833","2245","1312","3980,3981","1176","1312","2508","389,390","73,1124","123","73,123","144,268,845","523,3934","268,1176,1334,1521","367","1312","1124,1126,1127,1128","3174","3380","1176","1368","663,791,792","1312","1312","1740","324","1455","73,502,1367,1821","1439","578,1365","931,1312,1318","360","2566,2567","73,462,1822","1312","379,1583,1779,2006,2583,2584,2585,2586","1312","1176","3973,3974,3975","149","73,3382","73,1258","2240","3728,3729","2205,2206,2207","67,124,149,528","122","42,59,302","73","-77,-2385,-2386","73","73,78,149,252,302,385,425,440","2980","3164,3165","986","1432","73,563","454,838,1312","1385","1124","187,779","221","1432","960","1312","73","94","73,663,1367,1379","149,1176,1367","1312","3942","1693,1694","149","1455","73,90,1371,1518","663","1176","3728","3660","123,1365","1089,1090","1396","1455","73,96,130,131,132","148","2543,2544","1365,1366,1367,1370","2330","2330","2748,2749","73,275,788,963","73","454","73,1366","268","73,663,1176,3610,3611,3612,3613,3614,3615,3616","132","42,59,149,302","1367","73,174,825","268,1385,3160","174,761","701","3672","1588,1589,1590,1591,1592,1593","770,771","1365","1583,2870","1439","74","1553","1396","1367","478,1822","478,1822","927,1312,1455,1475,1476,2149","1958","61","4008","47,1455","286,854","39,1432","3980,3981","164","3388,3389","73","73","1312","122","1124","3190,3617","73,663","1796","1385","1176","1176","39,3783","367,1367,1372,1509,2578","1124","1386","3917","268,1347","1367","123,430","268,1243","1124","3913,3932,2339","3190,3617","4014","73,268","268,296,542","1455,3071","3401","1176","663","149,218,2771,2773","330","1396","113","766","73,123","722","34","2589","791","942","137,268","1312","73","1010","1312","1312","307","65,268,1385,1965,1966,1967,1968","1455","1469","4045","4005","846","1194,1209,1210","2164,2165","268","4012","874","73,149,1368","1124","1124","1312","39","3620","73","268","39","1312","1466","1364","563,745","73,268","171","1124","2461","268,1385","1206,1256,1274,1292,1293,1294,1295,1296,1297,1298,1299,1300","1206,1256,1274,1292,1293,1294,1295,1296,1297,1298,1299,1300","1331","73","73,1396","123,1152,1153,1154,1155","2500","504","1367","1396","73,1396,1397","1368","2296","73,123,766","823","1439,3517","73,3349,3350,3351,3352,3353,3354,3388,3389","73,149,1365,1367","83,1424","912","1430,3426","1258,2468,2469,2470","1124","171","1778","2837","1312","2817","73,250","88","73,1176","73,1176,3610,3611,3613,3614,3615,3616","73","73,88,663,1502,1503","144","58,67,150","912","2671","800,3231","986","1124","3656","663,963","123","1364","73,1176,2794","307,1251,1252","73,78,275,367","149","1775","88,617","1366","1312","123,367","3440","663,1376","1364","11,49,930,1313","3202,3203","510","83","335,1362","1367","73,1176,2794","42,404","3440","1333","1176,2970","2652","67,2182","42","663","663","1000,-3674","32,33,34,924,1312","1124","1312","324","1838","73,1368","124,1365","144,221,693","1312","1312","2883","2883","1124","73","2645","1452","1406","604","47","531","3038,3039,3040,3041,3042,3043,3044,3045,3046,3047","4062,4077","96","73,90,769,1392","139","268","103","-1547,1547,3516","59,73,224,247,248","107,247","107,247","73,250","1290,1455","14","3928","1830,1831","268,2525","1364","1124","1542,3943,3944","1385","268","73","663","1367,1861","2516","1991","73,1365","3591,3592","2258","1991","1991","310","1991","3937","1991","1991","267","73","1124","1991","3190,3617","3190,3617","1455","1311","1583,1584,3587","341","1312","122","67,123,430","73","71","391,392,393","273","1430","1153,2190","73,250","149","1396","3585","3377","73,2211","67,78,123,139,172","73,1512,1514","2388","1368","73,1563","2046","324,2114","2006,2583","-2430,-2431,-2432,-2433,-2434,2441","73","96,1369","4090","73","1365","3190,3617","123","1366","2383","4065,4066","324","307,1238,2671,3424","1824","73","2545","14,1070,1071","39","73","3921","3996","1366","67","3501","1152,1174","268","171","78,149,684,685,686,1367,1368","1469","73,250","59,67,123,149,263,528","404","231,1408,1409","2646,2647","339,340,1367","73,1366","3949","649","1312","73,143","124","73","3190,3617","1130,1131","1312","1368","42,59,1368","1312","1312","1312","1312","1312","1312","1312","1312","1312","1413","264,307,1206,1256,1259,1262,1263,1264,1292,1293,1294,1295,1296,1297,1298,1299,1300","146","1723","107","307,1206,1256,1260,1261,1292,1293,1294,1295,1296,1297,1298,1299,1300","268,1124,1329,1330","268","90","2081","1455","275,367","275,367","275,296,367,1942","275,367","83","1378","75","1144","745","1124","2346","106,779,780","1176","42,73,149,229,230,231,232,233,1364","171","122,1139,1140","626","1432","1455","644,654,2092","4028","1290,3373","1312","1534","1455","1312","722","39,925,1312","474,1096,1205,1206,1207","73,90,1371,1518","4037","330","986","123,430","1455","88,187,221,268,1385,1836,3078","1367","3952","1366,1376","417","137","1312","862","1367,1861","149,605","73","73,123,149,430","707","1061","2820","1455","2594","1312","73","3907","73","1366","1385","1455","-2431","1393","1073","2971","485","912","444,2294","73,123,430,1258","750","663","1176,1367","49","568","42,2142,4069,4078,4079","1366,1371","73,1822","1372","1365","73,1030,1399","75,1808,1809","1455","73","96,1365","1369,1370","73,90,149,275,663,1176,-1177,1365,1396,2716","1396","166,167","353,354,355,356","73","71,353,354,577,1176,1367","2104","1798","73,219,963,1385","65,1455,3700","31","1625","1625","73","1583","73,855,2113,2118","763","1326","1365","1176","226,836","2516","149","73,187,221,1396,1532","1639","1315","1452","357","1312","1534,2723,2725,2726,2727","3211,3212","1124","123","874","3449","2064","42,495","3916,4061","2346","73","3988","3190,3617","611,612","268","268","268","73,367,1176,2204","1238","-3728","3295,3296,3297","884","72,96,286","268","1365","2051","324,495","90,1176,1396","3190,3617","124,532","1124","2857,3698","42,667","123","123","73,1176,2794","1914,1915,1916,1917,3781,3782","1149","73","116,117,118,119,120,121,122,123","90","73","73,2873,3233","1924","71,101,171,663","1176","3945","1176,3190,3617","1369","3190,3617","663","567,1832","65,558,564,565","150,285,286","73,144","73,1366","106,134","4022","1124","3990","1030,1031","3190,3617","367,663","3190,3617","221","73","73,663,1176,1663,1723","1124","663","979","73","73,1366","323","2772","83","1405","3392,3663","75,392,2759,2760,2761,2762","123,172,430,1368","73","59,73,123,1365","123,430","563,1158","2304","3249","67,156","1452","3529","2791","39","1469","1176","1366","42","1864","248,598,950,1176","307","1385","1642","73,2199","307","73","307","1124","3972","1365","2919","1176","1633","1076","3271","53","1375","71,683,1366","1096,1304,1305,1306","3209","1367","4005","122,1139,1141","1836","268","34,1000,1124","299","122","611,612","106,261","73,1176","1366","79,81","73,818,1176","1364","1381","67,123","1312","1646","1124","1124","173,1365","1312","67,648","973","2739,2740","3588","1312","2456","3190,3617","415,537","83","2981","701,702,703,704","14,1405","73,2478","335,623,3026","2985","3660","1368","149","73,1176,1385","1037","563,1158","268","840","262,284","713,1312","302,763,1364","123,367","563","73,123,324,1175,1176,1177,1178,1179","1176,1367","1367","1312","362","430,576","123,430","1258,2468,2469","462","73,88,663,1502,1503","73,88,663,1502,1503","90","1124,4065,4066","568","2712","59","1365","1312","73","1124","3190,3617","268","73,88,663,1502,1503","73,88,1176,1502,1503","-2430","2512","663","73","73,88,1176,1502,1503","1176","679,944","73","30","73","1124","268","2113","963,1426,1427","15,267","307","1439","1412","67,264,408","4042","122","663","1377","49,1312","73,663,2233,2792,2793","1349","663","663","1176","74","2739","137","261,2197,2198","268","1365","324","39","123,1131,1152,1153,1154,1155","1548","74","73,1176,2794","268","1984","125","268","663,1367","73","760","228","49","268","1176","496,497,1176","73,1206,1248,1292,1293,1294,1295,1296,1297,1298,1299,1300","1366","379","73,663,2233,2792,2793","1176","1365","1396","1124","1366","1369","1795","73,219,367,1367,2730","123","2152","3792,3793","1889","136,1432","2057","1176,1329","155,268","2840","1750,1751","107,224,248,268","1124","58,67,150","73","1124","4072","1124","286","187,221,268","187,221,1528","1455","1368","2652","72,76,444,1347,3235","1176","1393,1395","1124","1367","3082","909","1124","1366,1367","3156","3156,3278,3279","73","106,268","73","1372","912","1176,2993,2994,2995,2996","123,1099","-2430,-2431","1124","592,593","3190,3617","1124","3051,3052","556","1124","324","3968,3969,3970","73,107,268","1176,1368","355","73,367,663,1176","2490,2491","1365","563","73,663,2233,2792,2793","268","1367","1124","1176","258","15,67,1332,1385","3190,3617","1176","1176","1312","1124","1049","1366","862","3902,3903,3904,3905,3906","766","268","73,1367","652","1918","483","73","1124","935","481","104","1366","1959","124","59,73,224,248,249","59,73,150,247,249,479","59,73,224,247,248,249,250","1855,1856,3523","59,73,224,247,248","1455","1408","1312","451","909","53","2639,2640","1935,1936,2643,4048,4076","74","73","1455","1365","1312","268","221,268,1124","268,907,1005","2224","221,1385","250,1385","268","221,1385","3207","1385,1406","268","3385","221","149","268","73,1365","-1313","-1313","74","1396","1124","846","73,617,719,1258,2743","73,1365","273","1367,1861","1367,1861","11,1312,1314,3754","73,275,663","268,1334","268,1367,1385,1836","663","268,1124,1563,2805","1563,3245","3190,3617","73","3190,3617","1312","653","335","31","2522,3480,3947,3948","123","124","137,268","73,149","1124","73,123","391,392,393","3087,3088","67","1365","1432","874","2062","324,3666,3667,3669","732","73,1176","42,366,367,478","3642,3643,3644,3645","877","42,2770","268","700","1176,1329","905","73,78,275,367,788,963","2260,2261","34","1124","73,616,1368","85,1312","1312","73","250,2024,2025,2026,2027","1176","485","73,221,296,538,1537","123,430","797","73,1513,1514","42,1366","1366","221,663,1176,2935","39","451","3774,3775","1124","461","268","53","59","297","1365","73","2840","73,147","268","2627","1466","1124","2276","1452,1716","731,1312","769,3143","275","229,1385,2788","1367","1124","1312","268","663","3093","4082,4083,4084,4085,4086,4087,4088","1366","1124","3918,3479,1034,4030","3571","324","1176","1836,2113","1553","73,3233","73","2482","1124","1639","1432","1368","1538,1544","1124","39","171","42,73,826,1366","1124","912","72,137,268","73","1124","1993","3345,3346","123,430,663","1452","268","1687","1430","293,608,1312","73,763,1370","1124","1312","909","73","1452","268","1176","3910","-3077,3077","1455","73,1365,1366,1367","1124","1385","268","268","73","137,268","132,416,3321,3322,3323","67","73","248","268","268","73","3806","1312","59","1455","900","73","1124","1999","2455","4003","268","123","876","474","1312","3176","73,1606","1369","2651","275,1146,3182,3186,3187","73,132,416","1328","73,124","221","184","1847","1219,1220,1221","3886","2992,3936","2879,2880","14","73,1149","123,430","1312","1367","1368","1334","1913","2687,2688","663","275,367","275,367","471","34,268,522","3684","2731,2732,2733,2734,2735","1366","123,367","268","268","73,3207,3208","1124","1366","1124","73,149,430,852,1364","307,2106,2379,2380","754","123,430,1198","67,217","1124","218","1176","326,327,328","1372","150,175,843","454","1373","3654","1455","1176","12,1312","73,123,324,1175,1176,1177,1178,1179","498,3963","83","2446","474,1096,1205,1206,1207","1226,1227","73","73,1176,3096","73,1176","73,90,1371,1518,1519,1520","3576","15","4037","3369","642","1385","720,1657","1312","1365,1366,1367","42,218","629","221","1100","611,612","1117","123","4014","912","1825","1023","808","175,176,1898","1624","73,2577","1000,-3674","1431","73,663","268,1385,1761","73,122,231,1366","268","42,71","139","1129,1130,1131","3190,3617","3771,3772","1356","268","307,2907,2908","935","660","1312","1005","88,248,268","485","611,612","73","1124","851","134,672,673","1044","268","1312","1372","307,1511,3393","1368","1471","1014","88,268","862,1324,1325","1365,1372","1920","68","241,1364","-3722","1124","67,214","73,231","73","3190,3617","1368","2253","597","49,52","73","73,1176,1238,1385,1522","73,1176,1238,1385,1522","1365","307,379,1290","73,88,1176,1385,1502,1503","73,78,275,367,443,788,963","1329,1396","1791,1792,1793","3438,3439","73","3032","1176","1312","67,123,430,431,432","73,1176,2241","123","73,505","1124","75","103,354,769","123,495","1396","73","955","-1031,-1032","910","2547","3549","1405","73","663,767","926","1365","73","472,1131,1133,1134,1137","3031","4008","324","74,1859","1124","1124","-2437,-2438,-2439","1328,1385","88,248","3979","3003","2346","3404","137,150,878","107","3190,3617","481","67","268","307,1343","286,854","2731,2732,2733,2734,2735","1368","590","72,73","3997","1893,1894,1895,1896","1124","248","268","268","73","73","1365","1110,1124,1204","1368","3033,644","73,462,1822","132","1367","73","563","1365","663","268","913","1439","1971","2458,3514","3513","1176","275","1509","123,1206,1257,1258,1292,1293,1294,1295,1296,1297,1298,1299,1300","206","275","1367","963","73","73,443,937","663","1254,3803,3804","73,1308,1405","178","2075","1734","1365,1367","1368","73","367,1368,1994","73,663","1124","1124","218,1367","4072","1426,1427","1124","662","663","1176,1217","1312","15","3914,4049,4050,4051,4052,4053","623","268","206","73,3233","3913,3939","451,1752","1366","663,1176","3989","72,107,224","268","1396","73","3261","73,1176","132","1176","83","663,1366","1312","73","144,1366,1723","73,2972","798","75,392,2759,2760,2761,2762","73,2305,2306","83,123,221,268,663,1176,1660,2757,2758","1518","978","367","3980,3981","1365","73,88,1176,1502,1503","73","3381","3874,3875","1124","444","1385","1124","73,1366","2195","274,1176","42","1366","1365","73,221,1176","1176,2993,2994,2995,2996","663","2051","1124","414,415","1176","221","1312","106,124,137,231,480,963","34,1985","83,1082,2175","1366,1367","96,1378","3588","3588","3588","3588","3588","3588","268,1393","1312","2179","611,612","379","221,268","1368","663","78,686,1367","71","2614,2615","1176","3207","1124","268","1124","1332,3343,3344","124","1932","1366","1385,73","2823","2249","640","123","268","3447","1124","147","144,1369,1723","1124","73","600,601","73,1030,1399","268","912","1166","846,1124","268","1553","3319","2132","73,107,268","1385","1124,1426,1427","1412","1124","75","171","1367","96","83,324,2276,2931","1618","132","1432","1124","286,538,623,704,854,1354","175","286,538,540,623,704,854,1354","124","3660","608","1455","3922","1124","1312","1462","769,3143","203,204,205,1368","629","268","1426,1427","73,302","4038","324,2509,2669,2670,2671,2672,2673","379,1290","347","783","2280","623,2000","451","3824","1124","2400","83,1424","1312","986,1124","1124","874","1367,2042","3255","1365","59","268","797","2061","268","73","124,406,407,1368","123,1152,1153,1154,1155","123,1152,1153,1154,1155","51","73,88,663,1502,1503","4016,4017","73","2376,2377","1124","68,481","73","1385","268","1312","204,205,1368","1048","324","379,2671","-74,-1177","324","1219,1220,1221","329","15,426","430,1368","221","268","596","39","1367,1396","291","4040","324","763,889","3909","1290","2554","1372,2059","3660","874","3763,3764,3885","1366","2579","709","1458","430","430,973,1368","123","3870","175,1871","267","268","2591","1367","905","963","73,1030,1399","2280","2778,2779","4073","1094","1366","67,149","137","2216","106","976","1405","1124","123,1152,1153,1154,1155","123,1152,1153,1154,1155","1312","71","1365,1366,1367,1368","149","14,307","1795","1368","990","123","1312","1455,3314,3315,3719,3720","73","171","963,1385","268","1124,2365,3628","-74,-220,-964,-1386","652","1366","1365,1366,1367,1368","204,205,1368","73,895","1124","887","1014","2409,2410","73","73,268,652,1176,1367,2230,2231,2233,2794","73,268,963","307","1385","-2430,-2431","268","663","1202","73,219,963,1385","1365","2685,-2687","1176","663","1366","1370","73","1312","1124","1638","1328","3236","663","663","1176,3002","1312","268","1368","1312","3133","912","3503","73","122,123,241","728","1365","1365","2731,2732,2733,2734,2735","73,853","1124","268","169,297,352","766,1368,1785","4016,4017","226,1832","1100,1124","1124","1312","325","346","355","1420","73","73","1282","1366","203,204,205,1368","1455","766,1943","1290","702","2189","1124","1124","3103","3621,3622,3623,3624,3625,3626,3627","1467","359","1804,1807","663","444","2068","912","1124","1432","1366","307","343","1365","912","73,220,367,663,1396","1455","-74,-770,-1177,-3252","912","220","912","912","912","1369","1124","42,409","2839,-2841","598","1312","1312","73,2450,2451","4019","3455","1527","935","1312","2290","2283,2284,2285,2286","268","862","568","67,663","126,127","963,1396","663","1365","1124","268,963","53","2659,2660","73,1385","73","73","268","2814","896","522","1176","1368","1366,1367","132","268","766","236,1104,1105","178","3902,3903,3904,3905,3906","3902,3903,3904,3905,3906","3902,3903,3904,3905,3906","1124","310","73,310,1307","3277,4072","1369","986","268","1124","1426,1427","355,2631","1328,1365","558","1829","231,1408,1409","1385","231,1408,1409","1880","231,1408,1409","231,1408,1409","231,1408,1409","3661","3097","73","307","1124","1124","2125,2126","2401","1539,4041","1364","1420","1607","1452","1542","1124","1124","1452","47","1238","787","1368","1385","1385,1406","275","268","3953","268","268","1426,1427","268","3207","73","1385,1406","268","73,963,1385,2950,2951,2952","268,1124","3207","1928,2009,2010","268","1385","312","275","268,1405","268,1006","268","268","1385","187","124","268","268","221,403,1385","2932","1429","1124","123","1366","1124","1312","268","1124","1405","221","1312","73","73","1366","1991","73","1991","1991","874","268","73,268,663,2233","1124","563,1688","1290","1367,1861","1367,1861","1367,1861","1238,3428","68","1441","656","657","42","1991","1367,1861","1991","1217","1312","511","1124","3665","268","268","1991","1111,1112,-1114,1114","1124","3898","3748,3749","1432","221","1124,3002,3198,3199,3200","122","1365,1366","73","1799","1124","1548,3516","2281","124","1124","2228,2229","123,430,1886,1887","73","1368","1366","2295","1367","896","1365","42","1367,2279","1149","1124","1222","912","73","88","4078,4079","1334,1521","3670,3742","1312","1619","4004","2791,3977","90,366","608,1312","3192","3248","3860,3861","1385","221,663,1367,1385,1836","1365","1073","912","1868","306","324","307","3911","73,1176,2794","663","268","73","123,430,914","1368","2731,2732,2733,2734,2735","769,3143","307","2807","73","73,620","83,204,791,1334,1345","73","1176","3029,3030","307","88","73,601","2323,2324","330","2546","-2430","59,173","159","221,629","73,1826","73","184","663,1366","73,663,1124,1176,1842,2365","73,1365","73,173","73","1368","135","59","73","1432","4022","663","53,73,916","985","124","1017","3305","307,1206,1292,1293,1294,1295,1296,1297,1298,1299,1300,3305","1396","2391","2335","622","1452,1471","137,231","3254","34,1124","1559","1367","1365","735","1368","846,909","877","512,513","1238,3469","474,1096,1205,1206,1207","1176","1369","73","967","39","544","1467","3141","2142","549","73,252,302,385,425,440","939","9,1319,1469","73,1176","1455","1176","530","1124","1365,1366","2180,2181","1312","769,3143","4082,4083,4084,4085,4086,4087,4088","4082,4083,4084,4085,4086,4087,4088","4082,4083,4084,4085,4086,4087,4088","1385","1365","1124","268,1124","73","73,1046","1124,2089","-74","2394","1312","268,853","1124","1954","502,1366,1660","4037","1370","1246","47,1825,3522","1385","556","1124","562","137","3492","791","73","1664,1665,1666,3556","83,1021,1124,1424","451","73","268","1426,1427","103","59","1312","1368","1365,2632,2744","986","975","307","563,1158","1124","1450","160","1341","149","1124","1995","1312","78,149,684,685,686,1367,1368","1312","1153","88,248","1368","268","231,1408,1409","178,261,268,385","451","1124","-60,-68,-124,-150,-264,-529","1458","1365","221","1312","4009","307","1432","2392","1455","324","47,1312","1395","663","476","1153","221,1124,1385","1124,1176","73,663,1176,3610,3611,3612,3613,3614,3615,3616","2897","1124,2625","1000,-3674","73,221,268","2652","124","231,335,878","73,149","268","58,73,150,183,184","268","248","137","268,542,1910","73,484","2901,2902","1332","72,149,221,268","149,268","151,152","59,73,78,3056,3057,3058,3059,3060","59,73,78,3056,3057,3058,3059,3060","59,73","59,73,78,3056,3057,3058,3059,3060","59,73,78,3056,3057,3058,3059,3060","1450","73","59,73,78,3056,3057,3058,3059,3060","59,73,78,3056,3057,3058,3059,3060","59,73,78,3056,3057,3058,3059,3060","59,73,78,3056,3057,3058,3059,3060","245,1095","1186","275","73,367,1789","404","1439,1448","1153,1312","3442","2441","813","1124","1332","1096,1097,1098","430","1061","1970","1452,2376","956","28,454,1442,1443,2527,3308,3309,3310","73,187,221,1396","1150","47","221","722,1124","268","1124","800,3231","74","73","663","1124","379","3205","77","2926","415","2215","1574","73,219,963,1385,3207","1432","268","57","1385","1332","1708","73","1393","663","74","1432","820","1124","563,1158","1124","275,367","3014,3015,3016,3017,3018,3019,3020,3021","1455,3253","759","74","1176","1366","1368","846,909","58","2288","268","623,973","1035","221","268","268","268,2512","1891","73,122","73","663,1670","2366","268","551","1450","67,78,123,430,874,1776,1777","123,299","73,123,430,690,766","1124,1176,1280","42,67,123,139,236,430","123,430,1198","67,78,123","1868","107,1527","39","1335,1385","123,430,663,1208","83","3270","1176","1176,1365","1124","1405","58","1153","1124","952","75","1312","1312","1312","73","1369","2555,2556","34","2645","1176","1366","73,788","599","83,1424","73,90,663,1518,1519,1520","73,275,367,1941","73,90,1371,1518,1519,1520","1124","1146,1147,1148","1877","1455","1450","3912,3913","1312","915,1661","2860,2861","1385","1432","533","-2430,-2431","1100","548","53,73,492","1010","1753","124,268","912","1906","1176","4014","73,573,1370","42,302","1124","268","1365,1366,1367","355,2632","3558,3559,3560,3561,3562,3563,3564","874,201,485","2282","1432","2257","307,2906,2908","1124","777","254","42,71","96","67,72,150","206","1969","545,3956,3957","3218","15,426","137,298","335","1534","67","1254","2001","2745","1385","71","909","73,122","1124,2395","47,1455","1976,1977","10,930,1312","137,224","1366","3149","137","3688","3734,3735,3736,3737,3738","15,268,297,1366","663","246,333","1176","324","1396","123,1152,1155,1156,1157","268","1372","73,691,1364","73,236,2037","137","1683","1152,1176,1382,1385","268","497,1366","244,1367","94,122","73,1365","73,96,1978","663,1176","3681","1124","1176","3512","73,663","1372","663","1372","1176","1432","663","1176","123,1106","1176","67,123,430,1365","1280","734","1509","1385","1372","307,379,1290","73,124,173,218,275,330,478","1365","1365","379,495,3284","2888,2889,2890","766,912,1034","3153,3154,3155,3156,3157","275","1368","15,73,1364","73,88,1176,1502,1503","73,1176","307,2255","123","4015,4047","90,354,577,1367,1393","1413","577","73","149,3032","379","73,138","2230","3207","73,88,1176,1502,1503","73","3919","330","1124","73,1597","989","1176","67,1366","3685","1176","324,2549","1365","1312","791,2644","379,2006,2583,2584","14,1244","2060","91","2864","73","1366","4027","1393","73,103","3379","1312","73,1176","3240,3241,3242,3243","2142","187","178","58,248","122,380","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2336","160","3269","611,612","73,220,288,1365","268","268","73,1124","3435","88","124","268","73","268","268","124,1385","124","618,1768","268","94","2512","611,612","2413","268","2226","67,1367","73","124,1176,1367","67,1367","31,382,383","1124","1368","1366","73,1176,2794","78,268,1368,1734","137","307","1366","71","912","1176","844","268","73,663,2233,2792,2793","73,616,617","1153","3661,3797","663","1396","332,444,1206,1292,1293,1294,1295,1296,1297,1298,1299,1300,1368","268","149,663","1367","778","139","2481","1365","663,1176","149,443","67,663","912","268,1405","73,502","3834","3923,3924","1385,3923,3924","663","1365","551","2959,2960,3746","221","3976","1124","73","268","1082","1117","1124","1312","221,268","692,1364","1124","299","73","73,268,312","4046","909","663","1124","73","276","4054","1367","663","1786","268","1367,1407","1583,3836","73,3094","461","3226","187,1385","1124","67,299","150,443","1124","171","34","330","1210","307,1206,1235,1256,1277,1292,1293,1294,1295,1296,1297,1298,1299,1300","627","1124","330","1124","34,1000","286,854","1366","509","297","73","275,367","73,219,963,1385","307","297","611,612","73","1616","1368","83","67,83,94,95,1365","268","1176","1176,2993,2994,2995,2996,2998","3452","1367","122,766","1903","275,763","73,151,2346,2426","611,612","99","1714","1124","1642","1366","123,430","330","1901","330","252,302","1124","268","3387","846","137","149","1455","1426,1427","887","187","1368","1366","73,149,1176","1385","308","846","1455","59,144,457","1312","419,1312","-2430,-2431,2441","324","1312","1676","1124","1455","641","909,1124","221","1124","1194,1209,1210","1072","1932,1933","663","73","137","1312","225","98","137","1385","1124","268","268","1364","1366","663","88,248,268","324","73","846","1944","73","83,343,766,2078","83,909,1124","73","221","1542","73","268","1450","3951","330","1368","522,651,846,1124,1134,1159,1160,1161,1162,1163","1124","73","83,846","268","3506,3507","663","1406","1153","379,663,1206,1292,1293,1294,1295,1296,1297,1298,1299,1300,1379,2013,2014,2015,2016","268","221,3384","73","1372","925,1312","3795,3796","3372","330","472,1131,1132,1133,1135,1137,1138","83,324,2276","299","268,2098","1312","1312","1124","1366","90","324","4037","1124","184,231,286,415,843,1770","335","415,1385","73,107,129,175,415,542,573,1770,2627,3307","567,1124","324,1439,2114","1365,1366,1367","1124","3366,3583,3584","39,1315","470,471","590","1376","1250,3341","1578","1455","324,3554","324","1773","1970","1368","1267,1289","307,1196,1288","3901,4025","2899","1124","34","688","1222,3104,3105,3106","67,268","2325","591","1385,2507,2508,2509","218,1364","221","204,205,1368","2205","42,88,122,223","122,1141,1164,1165","2729","34","324,2266","663","912","912","1176","1470","83,935","73,123","67,123,430","123,1152,1153,1154,1155","1156","73,1176","42,73,149,369,2204","268,3224","1385","3188","1124","1124","3386","1202,1426,1427","59,377","1825","14","122","760","1434","1092","2454","73","3538","123,324,2003","1134,1167,1168","290","139","1124","2320","769","1124","1451,1475,1476","1124","3083","1124","329,418","59","113,241","1365","42","1368","2140","123,430","73,88,663,1502,1503","2811","3375,3376","73,268,1385","1396","1176","59,73,123","-2791","181","67","1134,2658","669","80,82,122","491","221","1000,-3674","1312","1124","1458","34","1455","370","3934,3935","1989,1990","1176","1176","73,268,2233","663","1176,1585","73,210,211,212","379","1710","67,123","139","1455","314,315","1853","268","3478","73","107,137","1014","268","31","518","53,73,149,150","2700,2701","1332,1344","31","123","1124","268","1124","3190","-2430","2485,2486","2033","268","2221","1176","53,2042","2645","769","1176","1124","1507","1124,1718","1365","137","590,1206,1257,1259,1292,1293,1294,1295,1296,1297,1298,1299,1300","1271","1176,2993,2994,2995,2996","1383","73","1374,3012,3013","275","663","1367,2227,2359","307","1301,1302,1303","573","73","73","629,1386,1387,1857","275,963","663","73","73","73","73,601","1646","485","3163","299","28","42","73,1153,2757","1176","1124","324","1176","3492","1153","1432","417,1365","73","4065,4066","42","2353,2354","1124","67,1367","1331","83,1424,1425","611,612","221","663","73","1641,2388","73,312","663","379,1368,1393,1928","502","1124","264,502,909,1206,1292,1293,1294,1295,1296,1297,1298,1299,1300,1387,2465,2466,2467","1176,3002","1499,1500","1428","1312","1312","747","1469","1312","1741","1010","178,538","268","3739","962","963","1312","2441","1238","73,137,248","139,1365","2608,2609","1312","268","73","137","485","122,1139,1140","3665","3330","307,1195,1196,1197","73,1206,1256,1292,1293,1294,1295,1296,1297,1298,1299,1300","1369","912","912","663","912","875","454","912","1367","912","1124","73,218,219,220,221,1367","912","912","1124","912","1176","73","268","1367","1124","221","1568","67,449","1124","106,146,268","2862","1124","2136","912","149,1368","1472","3154,3347","73","321,322,323,324","330","3838,3839","76,3235","1312","271","1124","310,367","402","53,149,150","331","1524","1365","268","106,133","1176","106,779","2241","268","268","268","178","2601","663,1176","1366","1396","1124","1124,1379","2588,2589,2590","1364","268","417","1124","268","769,3143","221","73,268,1385,2671","2168","107,573","324,2114","2362","268","268","268","73","73,1852","268","2513","3901,4025","1432","1176","3929,3930","3902,3903,3904,3905,3906,73","-74,-311","912","73","688","73,1367","912","221","329","2475","1124","912","1290,3200,3223","1365","73,275","1124,2846","3477","1082","307","122","73","231,1408,1409","150","231,1408,1409","231,1408,1409","231,1408,1409","59,73,247,248","106,107,108,109,110,111","231,1408,1409","268,1240","1677","1303,2351,2352","59,88,149,252,302,405","1408","833","74","1455","1365","67,1367","689","39","299","1365,1366,1367","139","611,612","611,612","611,612","663,2453","3901,4025","268","14,187,268","58,72","187,1385","187,268,1124","268","268","222,1332","268","74,268","1332,1385","275","1385","1385","268","268","268","268","1124,1385","73","1124","34,2268","763,1366","1854","3665","3985","1396","4054","499","474,1096,1205,1206,1207","1124","1753","918","268","1124","1124","1176","1791","1247","248","3817,3852","1124","268","1367,1861","1124,1715","1366","367","73,83,1365,1369","367,385","73","221,250","1365","448","1312","221","1646","1124","745,954","67,68,1371","248","461","1991","912","221","356","791","1124","1469","47,953","3814","1772","34","1455","2103","2204","943","268","1654","3660","1124","2499","1364","1312","1366","663,1124","1312","123","73","122,299","1176","67,123,168","68","67,1366","1365","1365","123,430,1794","1124","1312","766","139,367,1365,3282","1365","58,73","2388","88","791","73,914,963,1176,1334,1521","73,1176,1334,1396,1521","73","4074","3982","2791","1937","4089","4089","4089","4089","4089","4089","4002","73","73","759","1079","2424","1385","327","1124","1455","1491","1367,2511","1367,1385,1836","268,1365","483","221","187","72,268","1564","324","268","1371","275","1176","1365","1650","307,1176","2123","1312","950","609","73","1312","1366","2405","3542","172,1366","1176","722,1124","4054","912","663,2807","1124","73","123,430","149,150,525","307,1206,1270,1292,1293,1294,1295,1296,1297,1298,1299,1300,3002","1365,1366,1367,1368","1124","73","268","1238","1365","73","124","73,663,2233,2792,2793","73","877","1233","663","3236","1176","73","663","73","73,1367","73,149,1367","1368","73,663,2365","663","1367","1369","73,367,663,1176","73","1368","1368","67,1367","1366","73,663,1176","67,1368","1366","73,2031","1366","73","556","1817","1931","1312","613","268","3305","39","1919","73,76,2445","663","268","73","702,2044","1124","1795","218","268","613","769,3143","1365,1366,1367,1368","1368","454","502","2536,2537","73","1385","73","1466","1385","3007,3008,3586","268,1426,1427","307","275","1312,1460","2142","461,2195,2495,2496,2497,2498","1047","2862","1364","1365,1366,1367,1368","73,3053,3054,3055","1365,1366,1367,1368","2600","1107","158","1124","1124","1908","149","149,268","1000,-3674","1368","738","1124,1385","268","912","73","3986","1385,1406","1016","663","73","663","73","216","912","324,485","1176,3638","42","122,1370","307,1511,3393","1124","2484","1064","3801,3802","2390","965","73","89,745","1385","73,250","324,1145","2830","83,1424","1370","1524","1825,3522","324","1124","330,139","1312","1735","1124","1385","113,123,172,475","1586","39,1455","67,1367","73,78,149,252,302,303,1381","909","1774","73,663","123,430,1369,1370","268","2894","268","231,1408,1409","231,1408,1409","231,1408,1409","231,1408,1409","1571","268","2071,2072","149,404","1030,1031","1124","231,1408,1409","1408,1409,1410","1367","663","2133","2133","2133,2134","3453","467","1365","73","929,3371","1182","563","71,1367,1660","1426,1427","324,1439,2114","1000,-3674","73,3548","73,268,312","268","268","268","268","674","196,197","67,106,436,437","268","296","268","268","2350","268","72,73","268,1332","137,268","268","3132","124,268,534","223,335","268,581","268,563","150,3074","137,268","268","268,1385","268","73,158,248,807,808","71,73,1366,1367","73","73","73","73,307,3328","221,307,1365,3328","3845","1312","280,281,282","268","1124","3092","77,78,173,663,1176,1364","268","1287","963","324,2094","144,1992","663","1455","828","221","3654","1366,1397,1948","1385,1396","221","1124","1312","887","1432","2947,2948","2683","58","73,3233","1328","1328","178,268","123","237","1370","73","1370","268","1035","1926","1124","1312","581","1176","1312","461,2633","1124","1312","123","74","1365,1368","67,1367","1124","268","67","502","256,1385,2990","256,1176,1385,2990","1312","268","122","1456","1576","564,904","1124","1312","1455","254","83","90","1124","1312","350,1124","53,73,1387","73","67","275,367","275,367","2591","324","1124","1455","719","1432","2113","34","268","67,911","717","1385,3317","1124","216","2142,2703","73","1368","330","88","88,221","129,2237","124","1347","268","268","124","172,1846","268","663","1109","663","745,2863","73,90,663,1368,1520","1385","67,123,149,1369","1124","1369","1455","73,638,1365","67,1367","67,1367","379","1420,3485","3546","73,137","2328","68","122","1124","3219","1023","1124","171,444","59","2545,2568,2569,-2571","2891","73,3034,3035,3036,3531,3532","1455","72,73","940","454","1312","1795","1367","113","663","59,73,137,268","1303","3440","663,1365","73,1366","1715","663","42,226","1206,1292,1293,1294,1295,1296,1297,1298,1299,1300","59,73,78,158,231,788,3567","73,788,3312","73,90,769,3143","986","256,1385,2990","1176","67,149","1176","1367","67,528","73,268,663,1836","73","42,149","221,1176,3150,3151,3152","71,94,338","1524","268","760","1332","1084","1124","1124","1970","1455","74","1432","1312,1316","268","726","1536,1707","94","2812","236","1710","707","3268","2238","1124","1124","891","1124","122","1312","206","638,1115,1116","638,1115,1116","1312","1021","1124","1825","944","3665","1450","2602,2603,2604","1455","2104","129","268","268","3515","3515","1471,2681","2074","-1546","2829","178,213","73","575","324","268,1367","1396","3825","73","1124","379,2006,2583,2584","1124","367,2038","268","268","1124","2387","722","1124","123","1094","3901,4025","343","178","1527","862","1853","1524","816,1051","1958","1176","1312","307,2806","1176","3492","1785","1671","66","-74,-220,-964,-1177,-1386,2676,2677,2678,2679,2680","912","73","1365,1366,1367,1368","73","2865","2534","73,4039","912","71","1124","3492","1153,2721","123,1152,1155,1156,1157","415,2103","14,73,663,1647","663,1197,1206,1292,1293,1294,1295,1296,1297,1298,1299,1300,1366","1385","624,1711,1789","1124","1981","67,963","986","42,59,782","1365,1366,1367","912","435","1124","1432","73","4043","4002","73","73,1030,1399","785,1455","13,3534","324","1368","663","73,88","3674","221,1385","1369","1369","1366","28,793,794","73,1238,1522","1365","663,1368","3109,3539","73","73,530,907,1998","88,248,268","1385","324","3136,3137","103,307,769,2954,2955,2956","149","3156,3157","1372","1364","663","1396","821","663,1176","3001","307","1424","1615","71,1176,1393","149,329","123","1366","73","1124","14,986","3837","1462","663,1176,1396","149","122","73,218,302","862","449,1644,1645","848","1656","73,462","749","3925","1452","3654","248,1949","1370","268","3577,3578","73,75,3075","123,1660,2322","1439","1124","1312","73","2413","307","14","268","766","139","1651","-2430,-2431","1368","1471","1312","1176","73","268","2212","1366","73,1124,3009","3022,3023,3024,3144","1455","1385","1610","268","1413","137,268","73","268","268,2780","2427","221,1527","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","4024","542,623,2551,2627","1364","268,2884,2885,2886,2887","2048","187","268","123,947","96,222,231,1368","2144","73,2719","268","611,612","611,612","268,1124","73,1176","1366","3178","1124","42,73,149,1365,1367","1362,1363","1124","2011","367","1367","1124","15","3965","67","7,-74,-1177","4044","1176","73,2606","1366","2049,2050","1124","963","963","73","2346,2422","1206,1292,1293,1294,1295,1296,1297,1298,1299,1300","546","1583","1469","58,250,1328","1365,1379","332","1396","1124","220,367,1369","73,2087","614","73,1176","1124","1117","1124","1365","1368","1396","367,1365","356,615","218,1789","1991","668","1367","1347","42,199,200","3927","1367","1367","1347","73,2087","73,2087","1367","73,1176,2794","268","502","2954","268","73,1176","73","1312","73,2087","3196","96,663","663","73,101,1366","1176,1366","58","73,2087","268","1124","151","1367,1505,1506,1507","1010,1290","90","563,1158","568","-74,-220,-964,-1386","1124","73","1455","1795","73,2087","73","1396","1312","1464","307,1206,1235,1256,1277,1292,1293,1294,1295,1296,1297,1298,1299,1300","455","367,769,3143","297","302,385,425,763,936,1328,1364","1124","14","2812","137,168,231,268","1176","58,67,107,125","730","1432","175,1871,2188","1432","1124","1124","330","502","3311","1176","1385","963","1366","73","1366","1176","1124","663","307","221","299","1124","39","1385","73,90,1518,1520","1129,1130,1131","268","611,612","2262","2401","2174","2711","90","221","307","1134,1167,1168","83,2089","1420,3485","20","1471","122,1501","123,495","1698","1455","3197","1385","1365","123,839","1124","1584,1725,1726,1727,1728,1729,1730","1124","1430","1450","1124","73,149,2925","1439","1312","1312","1124","1385","178,224","34","324,2114","2280","1124","1124","2114","3918","1365","724","1061","2531","124","330","912","1365","268","123,430","2441","268","73","2649","42,-1541,1541,4081","1083","474,1096,1205,1206,1207","73,123,268,1365","83,3081","472","1876","3098","2361","1469","34","28,793,794","268","310,1176,1258,3096","1368","1467","221","1765","909","2982","225","1797","1176","307","3169","1124","1390","1455","1124","912","1176","367,1365","1124","4010","502","74","2526","451","73","73,1176,2794","73,1176,2794","73,1176,2794","1124","912","15,426","1455","3025","542","537,538","335","129,175,542,3307","4065,4066","769,3143","502,1014","943","1152","791","1124","73,769,3143","1176","1467","1749","2039","307","544","124","47","2750,2751","-74,-770,-1177,-3144","1034,3479,3480","74","1455","1467","2707","3640","1364","1332","206","1432","652","1718","307","268","206","1124","794","107,137","88,248","1124","947,1151","139,442","1124","324,846","324,1439,2114","1655","1231","663","14","663,664","3530","1697,1698","73,123,430,766,1368","769,3143","1820","73","123,430","1124","1385","73","912","1124","268","1312","663","1010","955","137,1385","3545","67,149,590","254","913","663","563,1158","590,1265,1266,1267","1385","137","42","1455","3665","1455","1469","2629","241,242","187","1124","1312","149,172,302","656","124,137,268","309,310,1723","137","124","2552","268","1124","73,1367,2029","124,268","88,248,268","1432","1366","663","290","324","73,1369","1176","73","1900","3918","644","268","73,88,1502,1503","563","267,268,999","34,2139","2503","329,502,795,796,2904","1124","149","2811","1247","769,3143","73,1222","268","1124","73,88,663,1502,1503","3855","1124","3575","123,502,665","1124,2039","663","1368","2653,2654","291","1189","1124","1369","268","1124","15,426","1844","307,1526","1594","800,3231","3510","1124","663","3724,3725,3726","268","73,2195,2196","268","226","268","663","78","1583","1124","39,874","49","49","49","49","1455","73","123","90","42,67,268,430","2386","123,1152,1153,1154,1155","1194,1209,1210","1124","563","42","-74,-220,-964,-1386","3693","909","1148","1467","73","67,137","1385","1366","1795","1396","275,2445","2259","187","1312","67,335","1124","1255","1366","73,1176","76","73","1303","67,123,430","1309,1536,1537","1365","73,1533,1534,1535","122,2661,2662,2663,2664,2665","1368","73","1368","1367","1124","268","1176","1369","930,1312","324","2201,2976","1331","1367","1185,1951,1952,1953","1583","1124","103","73","2799","663","663","146,663","1110,1124,1204","451","324","74","3899","502,1784","663","73","522,2223","2292","324","1312","137","1328","268","307,1137","1365","122","15,1074","1176","221","34","74","379","67,1367","341,708","43","324,1438,1439,2114","4021","1124,1152,2365","1499,1500","969,970","1366","629","451","1201","74","1124","268,854","268,1528","149,268","912","1420","268,1385","216","1640,3958","307,2802","268","456","1124","1124","1667,1668","629","2300","1124","324","1176,2993,2994,2995,2996","912","1367","663","53,73,1368","912","912","221","88,248,268","752","912","137,860","137","912","791,2666","1124","307,3156,3157","268","1789","912","1583,3201","83","226","324","83,2480","1124","221","677,678","676","178","268","1124","1124","216,1455","3805","1307","663","663","1367","1367,1372","1365","1761","1922","73","2346","2076","178,1328,1385,3050","268","1385","107,265","268","2170","1788","268","1366","1148","73,2087","250,268,735","268","1098,1108","1564","1280","1124","3887","2255","1456","324,874","611,612","268","-74,-311","1461,1465,2124","1396","2399","1124","3222","72","268","67,123,571,572","1328","913","1124","272","2042","769","954","1061","1986,2713","3190,3617","106,107,108,109,110,111","107","231,1408,1409","231,1408,1409","231,1408,1409","15,59","105,106,107,108,109,110,111","268","231,1408,1409","231,1408,1409","231,1408,1409","231,1408,1409","231,1408,1409","231,1408,1409","141,142","231,1408,1409","1366","231,1408,1409","58,96,137","231,1408,1409","231,1408,1409","139","1549,1550","268","1432","1124","1784","70","73","267","83,1124,2690","222,2339,2340","1319","34","139","2042","2989","663","1452","1124","2619","810","1124","3665","88,1984","268","1332","73,219,963,1385","221,1385","73","275","221,1385","3207","268","268","275","73","73","268","73","268","94,124,221,250,1094,1328,1385","73","1432","137","548","73,2087","379,1583,2987","722,1124","67,663,1366,2472","1608","3213,3214","1432","839","268","1312","2441","73","3207","268","548","2103","1367,1861","1124,1419","122,144,307,986","153,385,629,1660","1991","1367,1861","1124","88,248,268","309","42,1365","882","663,1367","1124","1432","1124","139","715","1206,1292,1293,1294,1295,1296,1297,1298,1299,1300,2016","2264","1332","1312","42,59,1364","268","791","1387","663","149","325,1840,1841,1842","651","1312","267","268,1385","1124","1124","299,1165","221","28,793,794","67,178,1360","124,175,1871","268,1334,3027,3028","1124","379,2006,2583,2584","663","268","3417,3418,3419","1692","123","1010","67,123,1369","1124","1124","53,218","3856,3857","781","1312","122,144,307,986,1197,1229","73,107,268","1203","2104,2964,2965","663,1176","1715","1176","1176,1385,1396","73,1334,1521","1385","73,231,268,1026,1027,1332","365","185,186,187","1328","4089","4089","379","67,1367","1149","268","268,1365","307,3388,3389","187,1396","2208","1385","476","727,1369","73,1385","1980","1367,1385,1836","3654","1365","72,73","171,623","1217","1366","221,1367","1124","268","1068","268,986","124","1134,1167,1168,1169,1170,1171,1172","47","1385","1365","690","39","2167","31","137","149","1537","34","1393,1420","140","663","73,522,1515","268","65,324,1283","2489","1124","268","332,368,1365","67,1365","478","244,663","1124","1455","39","986","74","268","59","1124","1517","268","3138,3536,3704,3705","986,1332,1583","1452","1124","149,267","73,2087","663,1396","88","221","221","1048","122","73,1367","1312","42","1366","1124","291","1537,1923","1385","268","268","1124","659","1366","1000,-3674","149","307,2973","1385","1366","663","1176","73","73","1176","268","1396","1176,1396","1365","963","149,275,1366","1384","73,663","14,1368","88,248,268","324,1439,2114","88,248","299,404,469","1366","268","498","83","137,268","1124","912","2583","1176","719","1124","73","1101","88,268","299","3527,3528","88","909","1117","73,1396","3790,3791","73","1467","1543","14,3451","151","15","2067","2843,2844,2845","113,696","1176,1366","769","88","1124","1312","1469","241","1124","2381","912","1388","1432","912","73,124","3430","267","1124","1124","149","149,268","663","663","663","536","73,1176","268","275","83","268","268","1385","1836,2301","912","1467","912","1312","2553","394","73,2087","88","2982,3966,1002,3967","1469","73,2087","1664,1665,1666,3556","1010","1413","2008","3572","67,123,576","3409","256","88,248,268","502,1958,2904","268,478,1822,2224","1124","1312","1406","-2430","268","721","1365,1366,1367","1644,2698,2699","603,871","268","34","73","711","1124","544","1365","1331","384","1432","3579","72,73","986","1425","2441","900","83,1424,2508","302","73","73","1124","96","3423","67,746","221","221","1176","763","144,303,992,993,994","301,1381","39,775","3488","1649","268","1456","1396","752","2452","2176,2177","15,67,96,107,1332","231,1408,1409","231,1408,1409","2314","1312","611,612","1332","221","53","1061","912","231,1408,1409","231,1408,1409","1124","231,1408,1409","231,1408,1409","231,1408,1409","1312","122","3402","2283","2736,2737","67,1367","1509","1365","1312","73,88,1502,1503","808,846,2312","67,746","1124","1124","1368","248","-2430,-2431","759","3676","2441","2796","1124","1362","137,268","268","3983","268","268","1124","887","67,746","73,312","1332","611,612","58,67,268","1326","225,227","67,137","791,2508","67","268,3257,3258","132","268","137,335","15,426","221","67,178,1360,1922","268","67,178,1360,1922","106","2033","268","973","268","72,73","268","137","268","663","83,123,690,1124,1149","485","3061,3062,3063,3064","1124","1452","1124","3348","898","39,1455","1312","811","268","3876","2236","1014","2835","67","59,1365","73","1365,1366","2441","1369","1679","1065","14","3190,3617","2164","2874","1124","307","1455","1455","1124","2113","1529","1124","149","819","1467","1124","1065,2414,2415,2517","1124","1312","53,67,268","275,525,3179,3180,3181,3182,3183,3184,3185","221","73,1176","3466","1370","2623","123","2817","1124","478","74","58","846","912","1061","1490","1366","663","610","1471","760","1312","766","1312","502","268","165","2583","268","1455","1176","1455","2849","2102","846,1124","563,1455,2459,2460","1704","1124,1247","73","557","555","73,2087","2924","801","268","972","149","862","379,1583,3112,3113,3114,3115,3116,3117","2709","1368","268","2043","268","887","73,268","268","912","2123","1124","73","226","221","1455","124","123,1042","474,1096,1205,1206,1207","1124","72,107,224","1129,1130,1131","67,1367","67,1367","268","291","1124","1455","73,3058","137,887","1836","2949","3582","912","502,1021,2337,2393","629","73","1467","73,149,1364","2039,2266,2692,2693,2694,2695","175,1871","171,444","73,1366","226","1124","2648","1312","1124","1124","1455","73","124","363","83,324,2365,2366","34,65,83,324,677,2363,2364","1367,2042","1455","307","2035","1367,3374","291","73,601","28,793,794","1124","73,3313","1385,1396","1364","1366","42,90,765,766,767,768,1176","1385","73","73,90,663,1176,1371,1518,1519,1520","255,256,275","1176","3470,3471","1332","1075","72,224,1328","67,1367","83,1202,1426,2058,2091","149","73,219,963,1385","1455","2127,2128,2129,2130","73","34","1583","275","1057,1058","499","663,1176","874","39","1124","846","221,268,367","3509","1455","1134,1279,2347","1368","1366","1365","471","677,678,679","1014","73,90,1176,1371,1518,1520","1365,1366,1367","1124","1103","1124","1652","908","474,1096,1205,1206,1207","1124","1312","1124","917","722,1124","73","268","611,612","137","67,137","380","797","1554","1432","73","83","638,1115,1116","307,2893","638,1115,1116","221","1124","1124","254","221","1458","1124","73,1176","73,233,716","324,1438,1439,2114","1238,3454","699","1367,1861","1365","123,307,430,1198","3665,3755,3756","73","3293","1124","74","1825","1991","1439","1048","639","482","1222","2061","3324,3325","2529","268","3765,3766","611,612","663","3771,3772,3773","1524","53,73,96,149,150","1124","1367,1861","324,2114","42,71,917","268","268","1385","3525,3526","3466","34","268","67,72","268","268","106,506","2346","248","297","67,88,150","73,601","149","1686","59,73,171,1367,1379","1413","1312","3338","663","1238,3639","3504","67","3190,3617","1024","3618","74","90","3433","2810","268,1868","1124","268","451","324","73,663,1176,1206,1292,1293,1294,1295,1296,1297,1298,1299,1300","1385","609","1366","1366","3425","123","663,1176","1364","39,1432,1433","268","1124","1312","912","1124","2967","912","1124","96,1366","1048","1124","1366,1878","275","2033","268","2974,2975","3153,3154,3155,3156,3157","1368","1396,3158","2233","663","1148","124,178","1124","268","1124","1124","1558","236,1104,1105","963","90,354,663,1176","1632","-138","73,3431","2007","1596","1366","15,67,129,240","663","88,248","221,1362","71","1176","980","268","253","73","526","1110,1124,1204","1455","3111","579","1048","73,3002,4036","1455","1312","1312,1452,1468,2777","324","256","451","1312","73","308","137,268,409","461,629,2357,2358","1290","3500","3900","1455","1328,2945","3931","268,1328","268","268","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","3593,3594","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","3959","2445","184,268","72","73,268","73,2719","887","149","124","88,248,268","1385","73,107,268","72,73,286","72,73","1064","268","59","2112","1124","1347","132","58,178","1367","2214","184","1124","1124","268","1247","107","2605","58,1347,1358","73","42,67","1533","398,399","1368","1124","663","73","1368","149,173,814,1364","221","1914,1915,1916,3781,3782","663","2157,2158","2158,2171","2954","1368","1366","1368","367,1849","1365","124,1366","663","1217","1367","1367","663","250,1733,1734,2028","663","15,426","1440","221","1124","310","83","268","122,568","1124","1365","1124","307","73,663","1455","268","73","663","769,3143","73,122,139,791","73","73,663","65,1283","73","1124","-2431,2441","1312","1312","912","426","73,663,1518,1520","83,1424","73,90,1176,1518,1520","3394,3395,3396,3397,3398,3399","986","1124","2795","1192","1124","1124","3894,3895","3894,3895","420","42","611,612","1347","909","1742","2008","330","2213","178,224,870","663","74,268","83","73","83","474","307,1176","67,1367","1176,2993,2994,2995,2996","268","1396","1385","1365","1176,2993,2994,2995,2996","1176,2993,2994,2995,2996","73","2998","1176","73,219,963,1385","1124","268","1124","1176","1322","3588","1385","1962,2267","221","1312","791","34","1202","73,1365","122,324","137","1452","2136","1706","1124","74","837,2168","663","107","72,268","65,268,379,1385,1965,1966,1967,1968","3145","15,426","1124","1312","92","643","1124","1062","343","1567","47","1153,3415","1312","1456","2704","2338","1312","1455","1455","1100","2217","4067,4068","4067,4068","1432","1365","1124","107","124","124","1810","1124","137,268","73","164","1814,1815","1124","39","1312","1455","832","1628,3119,3120,3920","1455","1124","663","4046","4046","123,324,502,2417","1124","1124","1124","34","268","760","663","568","1124","137,335,1354","791","663","1365","107","268,846","74","268,1124","2348","2346","1676","2848","1021","1737,1738","1339","1339","1124","1393","663,1393","268","74","268","987","1328,1702","1106","539,540","537,538","73,107,415,573,1770","537,539","1614","1432","663","769,3143","1312","965","1534","909,1124","1452","1366","268,1385","2534","28","647","1124","3573","2012","1124","1421,2927","1905","846","245","245,563","245,766,1153","1124","1432","1124","1124","324,629","1463","1366","1881,1882","307,3342","663","324","2808","3259,3260","1124","3665","73,367,650,1379","3207","307","986","15,184,869,1362,1602,1603,1604","58,137,1347","2095,3933,2982,3966,1002","2183","1124","325","1124","1124","42,229,1380","67,123,430,652,879","1344","3933","663","2123","31","83","782","89","1367","887","2492","1455","1124","1365,1945","67,1367","268","337","887","1124","3491","268,3225","3227","2346","791","461,1131,1133,1136,1137,1214","615,1124","2850,2851","1455","262","123,1152,1153,1154,1155","1426,1427","3441","1455","73,1176","71,663,767,2279","409","471","986","42","2821","1206,1248,1249,1250,1292,1293,1294,1295,1296,1297,1298,1299,1300","912","1014","221,1385","1367","1312","268","3687","1450","39","268,1385,2154,2155","1124","451","1432","769","1385","268","137,1332","1124","734","1469","1455","73","1124","311,415","1124","1369","96,443","3237","171","769","324","502,1414,2146,2147,2148","73,239","957","2424","73,88,1176,1502,1503","1767","1176","268","1124","73,663","73,1015,1016","2815","1124","73,502,986,1176","769","1124","677,678","221","1176","451,963,1176","83,1424","917","1124","73,528","442","1312","1467","73","78","67,1367","83,951","1124","670","1176","1367","73","663","73","307,1524","275","1124","912","1228","123,367","15,426","1124","1124","2163","138","1312","268","1124","15,1350","107","1124","49,52","1455","123,1152,1153,1154,1155","905","1312","1455","149,296","1312","922,923","307","73","139","800,3231","1124","1367","73,275","268","88","59,73,241,1273","226","73,2232,2233,2792,2793","1372","1471","1367","73","268","1176","-2430","1124","1124","1238","83,1857,2145","2085,2086","-2431","139","1124","887","90,1153","791","73","663","1613","1124","1124","1017","1061","1226,3800","2378","-2430,-2431,2441","1124","2142,2143","2635,2636","1332","1124","1124","67,1367","3228","1048,1988","73","94,268,766","175,1871,2188","268","268,2896","2047","137","268","107","90,769","324,1328","663","1176","1778","611,612","611,612","1206,1223,1224,1225,1292,1293,1294,1295,1296,1297,1298,1299,1300","221","73","73,106,158,855,856","1312","139","1312","1786","1176,1786","1432","892,893","38,816","433","2419","1499,1500","1499,1500","1455","67,1367","1110,1204,1279","498","663","598","268","137,268","73","1124","630","1312","873","226","766","73,137","324,1424","221","1312","268","1124","769,3143","503","179","568","324","1241","912","73,149,222","1366","1366","912","73","47,1455","1010","1396","1124","1432","912","149","53,59,88,144,372,373,1328","325","268","268","3761","299","1873","3391","907","744","-2430,-2431","912","321,322,323","912","137","1458","2930","123","702,523","663,1367","1312","1455","268","1367,2081","1365","1369","1372","268","39","887","67","1124","2346","268","4008","3390","3287","73,2404","2766","1385,2542","611,612","187,221","268","1458","1352","1124","59,1367","2968","1312","663,1507","1507","3712,3846,3881","83,983","1432","1366","1124","1124","1291","67,1367","88,187,1086","663","73","1124","3457,3458,3459","268","1367","268","268","73,1180,1181","1124","268","297","324,1438,1439,2114","15,426","268","15,426","318","421","663,1396","1432","761,1507","1747","279","1034","3767,3768,3769","74","453","415","663","15,426","410,411,412","3037","1368","1124","1312","1061","73,897","897","231,1408,1409","231,1408,1409","248","231,1408,1409","231,1408,1409","231,1408,1409","231,1408,1409","105,106,107,108,109,110,111","231,1408,1409","3264","611,612","2535","47,1455","1126","73,1368","83,2697","364","2263","663,1176","745,816,1082","563,3320","3850","1239,2331","1238,3292,3293,3294","2168","68,502","1124","1124","663,1124","299","330","766","123,430","611,612","221,268","268","307","73,1030,1399","268","268,1757","275","268","1385,3445","268,1863","268,1405","268","963","275","1332","75,766","2605","304","107","107","1098","34","178","1124","722,1124","3405","1715","1111,1112,-1114,1114","1462","1366","144","1499,1500","107","1412","28","3326,3327","1124","1828","1124","1124","986","1617","75,122","310","73,233","791,2080","1429","1467","1124","124,221","639","330","1124","1455","73","1432","137","268","1124","3654","1991","913,-2430,-2431","1455","478","1124","1124","624,848","-2430","912","-2430","1365","1124","221","1124","1124","1455","1860","887","1124","451","642","1124","2867","2066","1061","1061","221","1312","96,106","958","268","3501","1378","1176","1367","663","123","123","123","1124","544,588","3121,3940,3941","1769","740","1030,1031,1398,1399","986","324,1217","2022","307","606","1455","73,1180,1181","1176","73,107","78","3282","1222","123","299","623","73","877","912","912","1079","2822","1124","1366","623,2193","268","137","137","4075","857","1,2,3,4,5,6,7,8,3600","1654","4034,4035","1059","59","379,3481","846","1368","766","107,224","73","268","324,1439,2114","268","1312","72,268,1884","221,3467","73,1385","2273","1426,1427","268","73,334","270,828","221","907","221","3265","67,1367","73,137,153,154","1124","1124","221,307","221","1134,1136","1565","3337,3378","1124,1424","1312","324","1124","268","1312","2962","73,1516","73","73","690","54,55,56","379","3543","544","786","368","885","324","302","451","1313","1312","2634","1312","1312","1455","83","73,324","74,1365","1176,2993,2994,2995,2996","677,678,679","1124,1176","663","663","1517","73","1600,1601","1811","1663","73,2211","73,2211","122,73","73","73","73","2708","103,663","2108,2109","68","1366","725","268","611,612","1042","913","1455","478","1061","698","1583","107","268","307","1312","1124","1366","1124","1312,1469","1312","1312","1222","1366","47","67","464,1312","307,1340,2983","64,65,1312","1124","1365,1888,2250","1366","67,1367","663,1366","611,612","1365","663,1366","2032","53","78,90,663","268","1124","563","663","67,1367","1312","1455","1455","267","1365,1366,1367","663","791","1124","1094","786","236,1104,1105","73,1176,1385","2650","268","1368","3403","137","1067","137","1963","73,1385","481","3828","2123","502,1365","3221","1401,1402,1403,1404","73","34,1000","2671","663","1786","3709","1312","3743","2184","1134","1432","1432","14","75,1732","791","307,1563","2626","71,663,1393","1124","3274","73,187,221,1396","73","1124","1412","187,221,1124,1385","73,90,663,1379,1518,1520","1124","1367","563","1312","454","1715","1365","1385","1366","1176","268","887","132","15,137","912","1385","1124","73,219,963,1385","3436","1124","1458","912","1432","1124","221","3679,3680","1176","1674","428","150,443,1659","1432","1001,1002,2982,3966","1452","3111","1364","1312","73","1238,3411,3412,3413,3414","1365","1124","268","3660","912","912","563","1061","53,1793","1723","73,1793","1366","187,221,1385","221,502,1336,2373,2374","1124","1124","1061","3662","221","67,1367","73","1431","1312","2287","124","302,441","963","302","1365","1370","73,78","1370","1365","1606","3533","124","1017,3964","73","330","59","231,1408,1409","106","3272","1217","3938","73,573,1370","42,59,404,476,477","75","231,1408,1409","231,1408,1409","231,1408,1409","231,1408,1409","34","1595","3432","1982","73","73","804,805","139","324,2114","1124","1654","566","1367","335,1362,1385","268","268,320","1328","1332","268","268","67","107","178,268","67,178,1360","1328","268","268","268","67,178,1360","887","184","67","137","1922","67,178,1360","15,426","106,1352,1353","124,150,178,238","88,248,268","15,426","137","53,73","53,73","887","307,1385","107","88,248,268","1124","327","268","73,83,434","1452","1368","1176","1176","1312","73","1524","3319","206","1124","58","1124","774","2618","671","124,268","73","602","3629,3630,3631,3632","268","1129,1130,1131","766","1701","137","1124","1124","3069,3070","1368","58","1455","2583","1312","1432","187","2344,2345","611,612","1176,1872,2986","1370","1715","3122","369","330","1467","58","1124","2605","73,251,252,1368","2215","449","149","1124","73,356,663","761,1507","268","1467","1124","122","1455","2683","124,2096","1455","73,137","1176,1385,2990,3148","268","2290","502","1583","83","2667","268","3715","67,1367","123,1187","268","268","137","1385","73","268","1370","137","2813","137","275","122","72,224,788","1226,3798,3799,3800","139","750","1365","1124","221","123","83,1424","1365","1455","123","1368","1124,2105,2106","2876","2598","1124","123","1938,1939,1940","83,307","268","73","67,1367","1124","1372","874","2840","1455","83","3204","1455","324","221","3897","1124","563","1124","149","1367","909","3813","1455","268","378","1455","3288","1455","2123","894","2816","1367","124","124","1000,-3674","2142,4078,4079,-4081","307","71","90","1452","563,1158","73","28,793,794","1455","1455","73,1367","1795","1368","1124","42","1432","1124","1455","1124","268","3486","73,3313","268","299","103,1176,3123,3124","73,3647,3648,3649","663","379,474,1176","663","1621,1622","1385","88,248,268","73,96,1366","1176","103","73,1385,3406","73,644,663,963,2464","1000,-3674","107","3707","71","15,42,150,372,424,425","473","663","611,612","149","1368","83,434,468","1455","2332,2333","502","1124","1124","137","268","976","3006","221,1385","1686","3420","1366","1367","1124","73,90,663,1518,1520","1124","254,359,722,745,1193,1194","73","767","1124","918","324","39,1455","1368","83,324","913","1124","75","1124","2580","2255","586","2457","2933","1061","1710","1561","912","1432","73","1073","1432","345,346,1366,1367","1007","1450","14","324,2114","324,2114","1253","39","1471","2269","123","268","1312","3807","471","1176","73","1029","58,268,784","1100","268","2854,2855,2856","307,2905,2908","1455","3654","96","1312","88,443,444","636,1206,1238,1284,1285,1286,1292,1293,1294,1295,1296,1297,1298,1299,1300","307","254","15,426","791","1032","73,601","359","3129","221","1327","1082","912","912","502","1124","15,426","73","719,2623","645","1366","1396","1124","1338","297","1082","663","268","-2431","1176","862","73","2073","1124","1061","912","912","268","68","2731,2732,2733,2734,2735","1312","1312","1152,1382","123,1152,1155,1156,1157","73","4065,4066","1366","268","912","912","1021","1124,1385","1964","268","1983","307,914","107","73,663,1030,1399","3762","663","1176,1396","1367","1376","327","912","611,612","73,107","1385","769,3143","267","324","396","268","1124","1124","1370","642","2444","1124","1124","34","34","1455","268,1366","67,1367","1902","175,542,623,2627","307","663","42,73,90,173,174,1176,1332,1396","67,1367","2479","1176","1471","73","408","73","268","1658","2689","1458","137","900","1124","1832","2326","912","1312","75","1365","1393","2722,2724","96,502,1366","73","769","1439,3844","1124","14","1312","912","3065,3066,3067,3068","2367","336","1485","1328,1385","268","268,766","4018","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","2731,2732,2733,2734,2735","289","611,612","663","42,59,73,404","663","268","94","15,67,89,648,846,847","73","268","1385","611,612","72,73","611,612","58","1176,2309","1312","73","906","1124,1426,1427","4026","1030,1031","663","73","73,1368","834","611,612","1124","58,178,268,1347","73,268","1368","1366","3193","1124","663","1455","68","4010","446,447","3004","1252","107","1176","1367","2157,2158","2158,2171","307,2053","1365","1396","1367","73","1366","367","356,663,1376","3915","1124","73","124,1347","73,663,1206,1292,1293,1294,1295,1296,1297,1298,1299,1300,2016,2020,2021","912","1368","1020","1368","1124","1124","2023","1365","137","761,1505,1506,1507","137","137","965","1124","3492","73,123,430","1176","15,426","15,426","502","268","769,3143","3894,3895","625","1347","1124","268","1365","1366","502","88","1956,1957","955","106,296,2346","563","268","226,268,623","1332","149,404","1061","900","582","1124","1646,1713","1176,2993,2994,2995,2996","324","1368","96","14,1290,3097","1367","1364","3082","88","1124","307,1195,1196,1197","1365,1366,1367","568","1958","268","1303","1426,1427","272","74","1124","83,1131,1182,1183,1184","384","124","611,612","1366","15,83,324,2082,2083","1124","268","912","2441","891","1238","4067,4068","4067,4068","4067,4068","267","1124","1467","324","1365","75,597","268","1124","1124","58,223,268","1124","1124","611,612","268","485,2838","3444","72","1124","31","913","341","1124","1312","83,2090","68","808,1073,1124,1127,1134,2291","563,1158","1124","268,1851","268","1290","1348","891","1312","268","268","75","42","107","704,1354,3095","153,734","1124","1124","769,3143","2346","611,612","1124","1124","2107","83,324,2276","268","72,107","73,1176,2794","73,1176,2794","73,1176,2794","73,1176,2794","73,1176,2794","73,1176,2794","2123","3691","630","3660","415","522,1362","125","106","324,3669","34","722","1061","3624,3625,3626,3627","311","1124","268,623","2487,2488","1061","1206,1292,1293,1294,1295,1296,1297,1298,1299,1300,1605","1124","1124","1124","1124","1388,3470,3471","245,963,1124,2720","1061","1432","78,268,303,1883","73,149","1124,2039","1368","461,2428","73,658","1367","144","-74,-220,-964,-1177,-1386,-1525","1124","73,651,1379","58","75","1124","1124","1432","3089","268","171","563","1312","73","497,2243","772","73","367","1469","2929","356,769,3143","2882","412","1124","1176","769,3143","1455","67,2116","2471","1365","1036","2482","766","1124","122","73,542,543","2259","268","-370","1871","1198","1432","1432","471","1432","387","752","2826","2123","73","273,2355,2356","1779,2671,2915,2916,2917,2918,2919,2920,2921,2922,2923,3650,3651,3652","2862","471","2308","2308","1176","1176","1321","96,756","1640","241","3569","1096,1131,1206,1292,1293,1294,1295,1296,1297,1298,1299,1300","275","3993","330","1312","83","663","268","2396,2397","1124","1467","359,3128","870","454","15,426","15,426","1420","2123","417,1365","1124","73,254","74","1426,1427","624","1365","1124","74","912","1312","1368","1755","1134","379,690","3231","502","67","78","171","523","3329","1872","356,663,1379,1872","1473","636,2518,2519,2520,2521,2522,2523,2524","73,601","912","1124","73,1180,1181","454","75","3511","1784","221","151","39","2866","451","78","78,356","1124","3252","1432","846","74","2638","611,612","73,2204","981,982,1365","268","663","1124","122","1366","1367","28,793,794","1739","502","88,248,268","663","3237","268","917","912","137,268","1312","1124","1124","73,1206,1292,1293,1294,1295,1296,1297,1298,1299,1300","2988","789","1218","307","1365","73,219,963,1385","268,1367","73","722,1124,1185","690,1426,1427,1428","1835","1312","268,1851","268","1124","75,835","1455","1111,1112,-1114,1114","1124","90","73,123,268,451,947,1232","663","1124","1124","1110,1204,1279","1312","107","346,766","3319","268","15,426","791","502,2904","1124,2595","2186","67,1367","2178","1124","452","2641","2591","137","3190,3617","268","153,611,612","311,2551","330","14","1455","1124","137,1351","1499,1500","1499,1500","1499,1500","1499,1500","1499,1500","487","487","454","307","1455","178,268","268,359,2690,3162","268","454","1911","149,971,1176","1455","3633","1061","1124","324,2247,2248","73,90,1367,1518,1520","1124","83,1131,1182,1183,1184","769,3143","769,3143","2398","912","307,3002","912","75","912","443","1369","1471","3173","73,367","909","1991","1385","912","912","67,1367","912","124","912","124","912","563","137","59,88,372","144","2668","474,1096,1205,1206,1207","66","547","1219,1220,1221","1124","107","1312","1098,1108","1365","563","4031,4032,4033","221,4031,4032,4033","137","1124","1312","521","1124","1365","1367","2327","73","15,426","558","1100","268","268","2542","221,268","268","268","268","268","178","107,268,1527,1845","268","268","178,268,2194","1432","28,793,794","139,1094","1366","1176,1367,2993,2994,2995,2996","268,1364,1367,1376","73,2141","15,426","268","663","549","1126","-2431","2641","1921","268","3011","1432","1124","94","1124","310,1242","1365","83,1082,1247,2210","83","122","74","268","595,897","231,1408,1409","231,1408,1409","231,1408,1409","231,1408,1409","1458","324","1432","244,245","1452,1459","73","1124","1124","425","3231","2034","454","887","307,2343","73,1176","221","1986","745","343,663,1124,1329","1124","912","3994,3995","1432","918","1723","1124","1124","68","175,413,701,1761,1762","73,601","909","268","4006","73","268","221","178,268","268","73,2527,2528","1365,1366,1367","409,618,648","149","90,1176","83,221,663,1176,1210,1391,1414,2247,2754,2755,2756","144","1082","268","137","73","187","137","221","769","73","248","74","107","1124","1124","663,2818","1367,1861","123,1010,1134","1312","68","221","1082,1857","1124","451","73","1385","997","1778","972","1124,1344","1124","330","800,3231","206","324","1061","73,219,963,1385","791","1432","3660","268","324","1124","124","28,793,794","1432","268","1312","96,106","96,106","96,106","96,106","96,106","96,106","965","3665","919,920,3653","53,68,73,96,173,490","74","1101","122","1385","325,846","107","3858,3859","307","1365","1775","73,914,1334,1396,1521","2119","4055,4056,4057,4058,4059","1455","1312","1312","523,822","106","2114","1124","485,1477,1478,1479,1480,1481,1482,1483,1484,2752,2753","1312","1412","1365","221","1366","221","221","663","221","73,221","1367","307","1393,1394","268","1432","1077","220","1312","1124","73","722,1131,1279","790","90","332","67,1367","332","1312","42,1328","1312","1312","1124","73,1517","1061","1958","67,178,1360,1922","1529","324,1653","1124","2418","28,793,794","332","268","1124","1369","502","1061","1153,4023","28","88","611,612","1432","3468","1396","1365,1366,1367,1368","1456","3508","2338","1452","3207","67,1367","73,1176","73,324,657,2549","663","1308","1397","307,1176,1744","248,443","1124","3496","666","30","1124","1455","1467","1124","42","268","1469","1124","1455","2589","324","268,854,1987","107","1833","107,1869","123","1124","1365","221","2403","1432","1000,-3674","912","219,761,1367,1504","1364","1282","1124","2493","1800","662","1432","1312","1124","1432","1432","2246","268","1124","2969","1467","816","1124","1124","73","76,207","912","1124","73","73","3236","1061","1124","73,221,1587","3694","149","1000,-3674","72,224","15","896","388","34","603,1082","83,1424","137","471","3501","2388","1366","1388","2787","1176","268","1124","474,3080","39","74","137","106,234,235,236","471","912","1644,2698,2699","1124","1412","268","1455","330","1124","72,73","58,73,137,153,171","1124","221,3229","1450","1124","307,2696","2580","224","1432","1366","3262","73,993","1366","1385","15,134,151,268","15,134,151","268","3266","1450","1124","2111","544","1124,1660","231,1408,1409","231,1408,1409","73,106","1746,3682","2831","1366","912","912","912","1124","803","208,209","139","629","1310","73,1374","219,761,1367,1504,1507","932","73","1507","73","219,761,1504,1505,1506,1507","171","1573","1000,-3674","2621,2622","335","550","268","887","611,612","106,134,136,137","330,1428","2043","3171","107","846,1124","268,542","221,502,2373","67,178,1360","106","67,178,1360","67,178,1360","106,1352,1353","268","268","67,106,268","67,178,1360","268","67,178,1360,1922","73,268","268","182","268","88","137","1846","611,612","1124","1124","1176","769","1124","324,2121","1564","1124","454","1124","73,1524","3069","3427","1124","3832,3833","2823","188,189,190,191,192,193,194","188,189,190,191,192,193,194","149","1366","1366","1218,3448","268","1365","909,1124","72,107,224","1455","39","2605","663,1124","1467","1010","502","83,1082","1396","137","58,106,150,168,169,170,171","2943,2944","611,612","471","268","769","275,525,3185","1124","268","268","171","1061","2682","295","1312","1176","1368","1124","1061","1795","73","2272","912","2341","1455","268","912","1970","1124","1930","2824","73,1385","1524","3946","256,1385,2990","1365,1366,1367,1368","454","1258","2490","268","2550","221,307,963,1176,3189","1048","451","454","471","324,1424","1471","662,1364","73,149","1124","73","1124","2504","324,1439,2114","1124","83","458","1467","343","73","1124","268","454","663","663","663","34","268","1365,1366,1367","268,1370","73","1527","542,623","1833","88","15,426","268","268","73,268,1332,2473,2474","268","224,870","107,224","149","471","2978,3580","1426,1427","1176","429","268","175,752","1124","1432","1871","2302","83","73,1867","974","122,500","73,88,123,172,1073,1366","67","1337","912","1455","307,1623","1455","454","268,325","912","1412","1455","1469","307","2407,2408","1124","221","73","912","1455","59","2315,2316,2317,2318,2319","986","1017,3244","1885","1455","2388","38","1312","171","1385","1455","2516","502","71,2235","90,663","3747","268","1455","1455","1455","1455","1455","1124","1124","3829,3830,3831","2119,2325","2684","963,1413","963","1124","3331,3332","268","73","73,3313","269,270,1368","307","1385","1176","256,1176,1385,2990","1396","1467","1425","1865","15,42,150,372,424,425","107","1176,2993,2994,2995,2996","1455","1124","73","73","663","1455","1124","2069","1675","325","1124","1176","663,1176","1176","1366","3991,3992","791","1290,3220","1312","1014","986","1445,1446,1447","2483","1124","1124","144,1366","162","2084","1366","677,678,679","1676","1124","502","1385","611,612","15,426","611,612","2705","73","1000,-3674","-2430,-2431","2406","1560","663","1432","472","2006","827","1899","1471","1432","1432","47,1458","28,793,794","268","1176,1396","1432","1176","1455","144,260","1368","249,404,618","175,176","324,2114","1124","3665","1898","2494","1366","1124","73,221,1385","124,268,2375","1426,1427","1703","663","34,45,65,502,677,2363,2364","268","1061","78","3660","663","34,1379,2293","146,663,1176","474,1096,1205,1206,1207","90,1176","1124","268","379,1238","1202","268","1161","887","1450","1124","471","1061","515","1134","1312","268","2350","15,426","1124","73,601","1366","3161","1,2,3,4,6,7","930,1312","471","1365","912","1124","912","122","1124","2748,2749","624,1711,1789,1874","67,648","912","912","912","912","1124,1367","1643","1098,2946","309","1680","782","67,124","1455","912","912","307,656,1206,1292,1293,1294,1295,1296,1297,1298,1299,1300,2911","912","760","4001","73","75","663,2342","1366","1176","53","187,221,451","231,1408,1409","1176","357,1742","1431","65,1134","397,403","73","1124","73,1030","2903","275","245","663","3581","268","663,1366","73","1124","1124","1124","639","2841","268","137","766","268","1366","42,73,173,174","296,914,1396","663,1366","73,137,153,735","268,663","367","-2430,-2431","558","226","226,558","1367","1312","324,1120,1685,3954","268","28,1312","719","1449,3786,3787","1124","1366","1467","3108","912","1365","1124","42","912","912","268","1366","139","73,221,502,1153","268","268","1000,-3674","912","73","3065,3066,3067,3068","3497,3498","2881","2597","73,1328,1385","124","1837","1005,1247","1332","2731,2732,2733,2734,2735","623","2731,2732,2733,2734,2735","941","221,268,286","72","73,107,268","73","15,426","72","178","15,426","398,401","1328","268","286,1836","611,612","221","1124","359,3128","83","268","132","73","267,330","1124","137","1124","107,313","75","2209","324","1922","97,2825","398,401","73","1176","149,663","73,663,1366","173","1347","137","268","1347","663","663","268","690","307","268,1332","1508,1509","3298,3299,3555","563,1158","1124","74","1101","563,1124,1189","1079","663","2200","1542","1124","1124","663","268","73","1176","502","3472","268","766,1781","1467","268","1124","28","67,1367","67,1367","1366","1124,1842","83","913","611,612","663","611,612","356,663","268","350","502,629","2515","1426,1427","15,964,1416","88,268,324","2389","561","1432","75","2846","221","1366","1124","1124","1124","1124","1583,2275","28","1312","1124","1124","1124","1124","325","302","149","72,107,137,224","67,107,137,268","28","2548","912","887","728","137","1368","986","28","221,1124,1217","1365,1366,1367","1124","3537","766,1763","268","1124","67","268","124","3624,3625,3626,3627","1577","912","74","912","268","175,1871","1238","28,793,794","1455","330","3735,3736,3737","379","267","184,268","268","846","2004","15,426","1124","31","1467","67,124","67,124","67,124","307,1385","173,1375","268","58","1124","1396","1176,1393","1124","752,1018,1019","1124","1061","1312","3862,3863","90","42,884","83","2150","1334","113,264","1458","590,1161,1206,1256,1274,1275,1276,1292,1293,1294,1295,1296,1297,1298,1299,1300","1455","73,107,538,540","73,537,538,539","542,1760","1124","2786","28","1061","90","1458","1131,1133,1134","3194,3195","268","568","1124","1124","870","2534","1795","1455","83,1082,1954,1955","3733","710","1124,1199","1247","83,1424","1124","1176,1396","1124","1124","1124","47,50","379","268","1124","680,681","1312","449","2160","887","1766","948","1124","1124","1124","829,830","1124","2616","1124","1467","58","268","123,947","39,1455,3658,3659","171","307,451,502,1344,1471,1577,1581,1582","39","137","471","1437","470,471","47,1458","1467","409","3250","3704,3705","1432","3536,3704,3705","3708","1467","2706","912","912","1010","874","1432","374,375,376","1364","1124","248","1124","1432","1924","1458","1124","474,1096,1205,1206,1207","330","1372","268","1802,1803,1805","1124","268","1124","3499","3987","2123","73","465","1312","83,1131,1182,1183,1184","766","791","1124","912","3126","1176","1715","508","73","1303","2534","73","2244","392","73","1458","1124","3660","14","330","909","49,1432","3231","3334","1367","1176","73","90,1393","90","1124,1417","636,2518,2519,2520,2521,2522","90,1176","1217","1124","1124","1124","808,1131,1213,1214,1215,1216","1124","1529,2421","663","268,1868","90","78","1705","1124","329","663","1238","846","1432","1124,1530,1531,2775,2776","1432","1012","268","268","454","1715","1272","1206,1257,1292,1293,1294,1295,1296,1297,1298,1299,1300","1244","3339","73,1176","73","1368","73,478,1741,1822","73","1176","1124","73,1149","73,1222","1124","1124","3510","1238","1312","791","1124","663","1124","1176,2993,2994,2995,2996","3810","1467","268","767","1124","1455","123,661","139,442","1884","42","1425","1412","1124","72,73","268","1660,2039","1103","73,2416","690,1756","1176","2123","15,426","124","1785","73,1385","1124","-2430,-2431,2441","1432","3410","589","1499,1500,3835","1312","1499,1500","1499,1500","1312","53","1068","1048","1312","268","1082","268","74,106,528","73","1452","3776,3780","1312","83,1424","912","1312","2828","1312","1160","15,426","1332","324,2114","268","300","123","912","912","15,426","14,1328","103","912","1124","611,612","306","1455","912","912","912","1432","15,426","611,612","3207","15,426","15,426","3722,3723","1124","1124","1708","1124","1124","474,1096,1205,1206,1207","1455","1312","986","1467","887","299","268","1312","611,612","1279","15,426","178","268","1366","1124","129,3521","1312","846,1217","623,1362","268","73,268,963,1328,1385,1396,3048,3049","137,268","2302","2592","149,1258,1759,1760","14","124,1744,1745","1833","268","268","2310","73,978,2451,2763,2764,2765,2766","1357","268,1801","151","268","268","68","15,426","73,219,963,1385","912","1176","1717","1124","83","478","592","638,1115,1116","178,460,461,462,463","268","72,107,224","611,612","15,426","1857","1458","1312","646","1764","268","1455","324,1124","1124","2957","642","2957","2334","663,761,1507","231,1408,1409","221","2414","1124","1312","65,1283","132","73","1471","324","1458","137","83,1424","137","1367","187,221","611,612","15,426","2441","268","3207","3207","268","268","268","137","1816","1467","454","3923,3924","1124","1124","2933","3492","1365,1366,1367","2655,2656,2657","454","1366","1124","1970","611,612","1458","291","841,1124","3289,3290","2819","1131,2710","1715","221","275","3492","603","1124,1418","73,1562","-2430,-2431,2441","73,1152,1235,1236,1237,1238","1312","1991","1365,1366,1367","1312","846","1365,1367","1364","34","83","205","379","1124","3177","1124","158,1124","268","800,3231","1408","1124","1312","2244","123","123,430","1010,1754","123","73,1176","226,299,1118,1119,1120,1121,1122,1123","1124","3256","1455","71,90,1368","663","1365,1366,1367","324","39","1061","1467","1365","2106","1176","1455","137,268,611","1124,1385","1124","1124","73,219,963,1385","73,914,1334,1521","1124","1124","1564","471","736,737,3822,3823","461","2239","2169","1366","73,1385","268","221","268","268","1534","268","2206","1124","498","1455","1124","267","1787","1124","324","324","485","268","73,1073,1961","73,268","677,678,679","846,1124,1176","846,1124","83","663","846","73","663","73,1176","42,1328","42,1328","42,1328","144","1450","1450","1467,1682","912","471","1061","1312","73,1517","28,793,794","1731","330","324","221","74","3443","15,426","1030,1400","2869","268","268","175,176,286,854","73,1396,1507","53,3140","73","662","1396","53,96,1365","1367","231,1827","1368","663","1366","594,595,596","846,1124","1290","1124","912","963,1385","1369","846,1124","1312","3541","67,137","268","751","107,224","42,268,1176","268","88","663","1920","107,224,870","268","769,3143","73","268","988","1973","766","58,268","1176","1471","894","39,1432","1124","1467","15,426","1455","663","268","324","2222","1432","73,573","758,1312","1124","1124","73","73,123,1365,2289","1124","76,178,3235","1385","1124","1290","187,221,1124","15,72,268","1124","34","1922","268","1365","14","1176,3238,3239","766","1534,3217","1312","1055","1970","763","2122","268","1124","1124","122,187,221,268,1368","1010,1134,3367","846","2624","912","291","119","1061","2244","73,221","2244","31","1063,1290","90","1152,1389,1422","1124","3474,3475,3476","73,462,2329","42,342","3190","1366","1094","254","1341","268","986","1061","3665","1124","1432","268","2914","107","231,1408,1409","2859","30","28,793,794","221","178,268","231,1408,1409","231,1408,1409","42","887","3592,3595","73","690","324,2114","4065,4066","3437","1049,1050,1364","221,502,2373","67,178,1360","15,426","696","1833","137,268","73,103,769,3005","268,1124","268","268","67,178,1360","178,1359,1922","67,178,1360","268","268","766,1202","1096,1097,1098","187","1082,1974,2266","96,663,963,1365","1124","588","178,268","573","268","15,426","769,3143","1366","1471","1124","1832","1843","1843","1843","1124","1222","268","83,965","3493","1061","1124","1124","1426,1427","149","675","1312","83,1424","1052","1452","2797","611,612","1467","1124","3763,3891","951","252,1368","1312","1124","975","2168","2862","1385","175","1312","1281","1124","1455,1469","1061","766,1752","1426,1427,1428,3119","83","1124","1455","1432","1055","1455","1536","268","266","1455","791,1365","1455","268","1455","1366","2278","1124","2106","15,426","268,2512","611,612","268","2000","14","611,612","268","268","1005,2368,2369","1006","1124","1366","1789","221","268,1426,1427","1124","307","2653,2654","1124","1366,1367","1369","319","963","267","144","67,1367","1124","1455","1467","1455","268","124,175,176,177","3824","1455","42","581","1475,1476,3619","912","912","42,73,624","1699","846","887","1061","359,1176,2690","144,2099","2125,2126","1124","2892","1367","1124","356","103","486","1452","2313","1365","83","1432","1432","14","1124","1432","1455","3849","2132","73,90,663,1518,1520","769,3143","1455","1000,-3674","434,1124,2058","1176","39,40,41,1312","3369","1124","1124","1124","800,3231","73","1672","1367","1455","1238","2552","766","560","611,612","409,1312","1432","1124","1124","73,90,663,1518,1520","73,90,663,1518,1520","1455","330,1124","1313","1124","324,1124,1210,2401,2610,2611,2612,2613","1758","1079","1124","1124","1124","1124","1124","123,502","1124","72","611,612","268","137","268","3670,3671","122,1176","1124","1124","367,1365","103,663,1393","71,1365,1366,1367,1368,1393","3110","912","2961","3710,3711","1124","28","2256","221,268","1124","485","1124","3660","1467","1124","307","1432","3660","471","1432","42,765,766,767,769","1458","1795","1432","324","283","268,1850","122","1365","73","1312","1062,1904","2942","1234","116","3718","451","1432","3853","1124","34","1124","1524","268,1836","268","83","325,1124","74","3508","74","466","2581","1124","73,367,2204","1094","1238","1583","62,63,1312","1124","1061","1061","2510","268","1859","268","268","2558","1124,1426,1427","73,601","1124","-2430","307","1583","1176","73","1385,3340","268,1868","73,1176","912","1367","450","122,1060","912","14","1303","2153","1455","3808,3809","379,502","73","73","1061","502","1061","1124","1368","73","1124","268","73,90","307,769,1206,1267,1270,1292,1293,1294,1295,1296,1297,1298,1299,1300,1385","2728","601","268","3464,3465","836","73,462","107,137","611,612","128","2800","1176","72,73","268,1385","1365","73,268","72,73","1176","1365","42","72,73","1148","1492","1362","83","268","83,1424","1312","621","1455","1124,2501,2502,2503","1124","137","1455","1312","1124","123,947","3660","3660","34,563","1312","1423,3400","1124","34","769,3143","137","611,612","553","1420","1124","73","1,2,3,4,6,7,3519,3597,3598,3599,3600,3601","15,426","485","241","1010","268","1334","324","611,612","268","1455","248","72,73","611,612","15,426","15,426","426","1365","3492","1467","1124","1369","330","236,1104,1105","1366","47,1458","178,268","1124","58","1720,3955","94,175,176","1,2,3,4,5,6,7","474,1096,1205,1206,1207","1366","1124","1795","268","73,1368","3216","1970","663","137","1347","268,3100","1385","73","986","58","1091","1124","1368","3843","1432","1312","3877,3878,3879,3880","58,1347","648,662","502","73,90,1371,1518","73,90,1371,1518","745","268","268","1124","15,426","1124","1312","1365,1366,1367","1551","1551","1124,2360,2714,2715","248,824","2045","1909","1124","1124","14","73","611,612","1068,1079,1124,2462,2463","1124","139","330","323,528,1364","611,612","1124","73","663","912","324","1197,1229","1624","1124","502,1086","1061","1124","73,219,963,1385","1458","887","312","1583","1609","1450","1124","912","687","619","2156","1061","4067,4068","3695","1312","663","324,2114","137","1458","846","1455","912","1124","330","1124","611,612","268","73,123","67","268","73","268,542","268","3370","1469","1534,3217","3778,3779","1467","552","73","1467","451","15,426","1435","1124","67,901,902","3790,3791","1432","965","1312","1365","268","3882,3883,3884","1124","268","1238,3422","187","470,471","221,542","3508","58","286,854","1684","58","1467","1124","912","502","73,1176,2794","73,1176,2794","1420,3485","702","1458","537,538,539,540","3712,3846","874","413","1467","1432","73,128","1124","1366","34","90","67,123,1154,1365","2311","2682","1124","1124","34","268","1124","1279","1312","1367","663,1176","1366","149,231","912","896,1124","137","1124","2040","1124","1124","268","124","268","563,1124","73","42","1432","769,3143","769","769,3143","1455","2538","2691","502","745","34","1455","1191,1192","909","1367","324","90,769","1124","73,76","1455","178,268","34","1312","3506,3507","1176,2993,2994,2995,2996","1124","766","912","73","67","887","268,1176,1396","73,1176","221","800,3231","137","563","1452","877","2441","307,1124,1247","47,1458","1367","1124","67,1367","955,1066","1124","291","324,1439,2114","1458","583","1124,1385,2039","2292","28,793,794","471","15,426","1176","3763,3764","2166","1312","1124","968","1366","846","914,1385,1525","103","636,2518,2519,2520,2521,2522","67,1367","1124","28","3127","268","2254,2255","39","1455","454","178,268","268","1176","846,1124","73,223,268","324,459","123,1216,2185","224","221","1455","1038","124","1124,1530,1531","1233","1945,1946","663","1228","1124","73,1124","611,612","371","722,1124","1124","1452","1432","4065,4066","1455","1124","1176","1124","123","356,769","34","344","1124","124","268","1368","15,426","67,1367","1839","1124","1124","72,73","1124","1312","1124","1432","73,1206,1292,1293,1294,1295,1296,1297,1298,1299,1300","34","1124","1499,1500","1499,1500","1499,1500","1499,1500","1499,1500","1499,1500","1499,1500","1654","1303","690","1124","178","1312","74","1000,-3674","1467","663","1124","1124","1312","1366","28,793,794","1719","1206,1292,1293,1294,1295,1296,1297,1298,1299,1300","1124","34","268","1124","1176","1467","1124","1803,1804","122,144,307,986,1197,1229","73,1245","912","83,1131,1182,1183,1184","912","1124","912","912","611,612","912","15,426","1124","28,793,794","1469","83,1424","439","1689","1455","900","1922","1124","2104","60","15,426","268","1455","986,987","502","137","73,1180,1181","1312","73,1858","502,1280","1695,1696","1696","1456","361","596","611,612","15,426","526","268","1467","3851","722","1124","1365","1102","897","2349","1124","1124","3520","68","1188,1189","1176,2993,2994,2995,2996","323","1432","1365","268","58","268","268","268","3492","913","1467","478","769,3143","28,793,794","307,1290","1082","53","1366","1176","1124","34","73","3568","1124","1124","268","2252","972","912","912","2582","663","1467","1124","568,766,1718","1124","171,502","268,763,2077","1779,2088","1124","1458","3962,4070,4071","1396","1269","654,655","912","268","42","187","122","28","1190","15,426","1396","-2742","1312","1124","1312","236,1104,1105","1176","1124","1458","-3283","3268","1124","1455","74","1312","4011","1124","28","603","379","268","299","268","1368","1388","73","502","671","1124","268","39","3492","3508","3190,3617","268","1365","15,426","42,1328","1124","65","324","791","611,612","268","73","268","1124","1857","1124","912","663","73","73","1176","1176","1124","73","663","123,307,430,1198","2280","912","1124","1312","1124","3789","1393","663","3788","1862","103,663","47","75","83,1424","2702","15,426","150","1217","3660","90","912","1124","3892,3893","15,426","15,426","72,73","663","611,612","1087","1069","74","1124","1715","2310","2123","39","1312","1124","1385","1458","1312","330","299","137,268","268","34","1432","451","127","137","1124","1432","88,268","268","268","224,268","248","149","663","815","1124","912","1176,2993,2994,2995,2996","1176","47,1458","3429","73","1124","574","1124","2477","1124","1124","330","745,752","1124","1432","1467","1124","83","3408","268","2587","73,219,963,1385","73","3978","478","2621,2622","914,1385,1525","1818","72,107,224","137","268","1432","1124","485","73","137","862,868","15,426","223,1355","268","268","67","113","15,426","268","268","137","67,495","106,137,268","15,426","1328","603","1432","1857","769,3143","330","1425,2138","1124","745","83,1424","39,1455","1312","912","1771","1499,1500","3655","3139","219","454,1639","611,612","1124","435,1432","1467","324","663,1206,1292,1293,1294,1295,1296,1297,1298,1299,1300,3002","1124","1432","1124","83,1859","454","1176","1455","1124","1124","1455","3101","67","1124","1455","1124","330","2928","137,268","104","1124","73","28,793,794","485","1124,1421","2017,2018,2019","1455","1455","1455","3505","1455","161","872","1455","1048","137","1455","1312","73,219,963,1385","802","268","611,612","887","1834","15,426","611,612","15,426","611,612","887","268","243","224","611,612","963","3000","268","268","73,745","73","1455","1124","663","268","663","1455","1366","123,430","1124","1469","1795","324,2114","39","67,1367","2852","42","1455","291","1124","1312","90","1455","1233","1455","2366","3367","67,1367","73","1455","912","171,444","2545,2569,-2571","137,178","1124","1455","34","3665","1061","1486,1487,1488","1176","1176","1043","1176","3456","568","73","912","73,663,2476","1574","1455","1455","72","137,268","1467","1970","1366","1364","769,3143","1367","1176","769,3143","88,248,268","73,769","59,149,218,1368","1364","1000,-3674","1455","1455","73,90,1368,1371,1518,1519,1520","3819,3820,3821","1458","766","3784,3785","268","1458","73,1206,1259,1292,1293,1294,1295,1296,1297,1298,1299,1300,2466,2938,2939","603","330","34","73,90,663,1518,1520","145","745","1832","73,123,663,988","1098,1108","1455","1124","502","106","1307","307,1195,1196,1197","1452","1412","291","1048,2052","1385","1278","476","3665","886","1467","1366","291","268","1458","1497","379","1124","73,663,2577","74","59,248","988","324,454,2114","1124","1432","912","722,1124","1467","292","533","29,1979","3853,3854","299","1124","1124","677,678,679","1455","122,323,2530","67","451,791,909","1405","1366","3712","912","2991","2809","3690","663","3654","1124","1238","72","73","544","268","73,601","73,1510,1511","14","1455","2218","1124","561","912","745","1226,3799","3363,3364,3365","31","3697","123,1152,1155,1156,1157","1456","1456","149,697","912","912","3660","2876,2877","73","73,2225","83,1131,1182,1183,1184","73","248","307,1152,1268,1269","1124","324","73","129,268,1354","1124","1176","1366","73,221","642","268","73","1432","268","73,2303","268","58,106,171,178,733,734,735","73,663","67,1367","722","1176","1458","21,22,23,24,25,26,27,3602,3603,3605,3606,3607,3608,3609","808","201,202","73","74","221,502,2373","324","1312","1413","15,426","1572,-2430,-2431","124,268","73","1583","1124","1455","766","1124","1452,1469,1474","1455","1431","563","47,1439,1583,3811,3812","912","3065,3066,3067,3068","3065,3066,3067,3068","21,22,23,24,25,26,27,3602,3603,3604,3605,3606,3607,3608,3609","1455","611,612","2731,2732,2733,2734,2735","268","73","611,612","611,612","268","611,612","611,612","58","903,1709","221","268","1368","307","1385","451","1866","1124","769,3143","1124","1124","1124","68","1372","107","1467","67","67,158","268","986","268","58","682","1053,1054","73,90,1367,1518,1520","769","912","2420","1124","137","268","663","1875","2836","959","324,1438,1439,2114","1124","1124","1124","268","2095","663","611,612","1176,2993,2994,2995,2996","611,612","343","1124","3473","3207","1499,1500","83,1131,1182,1183,1184","611,612","611,612","1124","3273","39","1458","330","603","1467","1312","3815,3816","4037","4037","4037","4037","4037","4037","4037","4037","4037","28,793,794","1432","1467","1385,3130","330","15,426","221,268","137","268","1467","2671","15,426","15,73,195","268","986,2617","206","42","430","2360","791","2607","1124","53,886","330","912","268","1061","1124","90","1124","73,219,963,1385","1458","3660","786","912","611,612","1124","1124","2411","1124","1929","2559,2560,2561,2562,2563","1366","1432","766","2040","1124","1124","80","1432","1368","68","663","1432","458","3794","1426,1427","556","325","2997","1124","67,1367","1312","297","912","107","1452","1457","122,1457,3300,3301,3302,3303,3304,3689","1455","1458","1458","1176","34","1129,1130,1131","1367","1124","1124","1458","1124,1176","1455","307,1344,1422,1578,1579,1580","1432","471","471","423","163","461,791","28,3131","324","1467","34,379","28","1312","67,178,1360","1124","379","330","1124","2030","2113","3847,3848","1124","800,3231","3231","1124","248","1458","1369","1206,1292,1293,1294,1295,1296,1297,1298,1299,1300","268","1367","1124","1660,2139","1367","15","1795","1000,-3674","1312","1458","1124","1124","73,221,914,1385,1525,1526","268","1124","1124","67,178,1360","1605","214","1605","1458","636,2518,2519,2520,2521,2522","1812,1813","123,663,896,935","1124","1412","137","15,426","1124","2542","28","1176","912","663,2858","299","171","67","3010","638,1115,1116","611,612","2202,2203","566","268","1039","912","912","644","963,3547","474,1096,1205,1206,1207","3660","123","15,426","15,426","73","1426,1427","1648","912","330","1456","88","268","542,623,2627","83","1583","3535","563,2834","1124","137","83,1082","772","359,502,909,1660,1819","1124","257","137,146","88,248","58","1848","611,612","2781,2782,2783,2784","855,2669,2672,2673,2674,2675","137,268","663","1010","206","395","1061","1412","1312","663,761,1507","67","3079","1124","1499,1500","1499,1500","107","1846","1432","268","268,1124","1312","3368","297","178,1358","268","663","15,426","912","73","1124","1124","206","525","525","912","307,3461","15,426","268","1857","83,1424","1124","1176","1312","1124","324,2114","1414","1458","28,793,794","1611,1612","611,612","1124","330","1124","870","3759,3760","268","268,1801","1788","1432","1458","874","1366","2162","329","324","611,612","1124","324","83,1426,3090","14","73","3590","172,221,706,753,1365","766","1583","171","330","307,3160","2979","2979","2979","1312","921","73","1124","1455","1458","1752","1124","74","755","1432","73,219,963,1385","722,1124","1385","611,612","611,612","1669","2933","1499,1500","912","912","912","1124","3316","1124","1124","1367,1861","268","73","2008","1124","1217","139","1124","1124","1312","1000,-3674","1312","112","1003,1004,1005","273","1124","1124","1396","28","14,123","1124","1124","1365,1366,1367","846,1124","330","123,307,947","123","299","663","861","28","1432","1836","1124","1176","912","4046","1455","611,612","1724","73,1385","1124","1455","178,268","15,426","73","2100","611,612","1795","83,1424","526","15,426","1124","451","1454","73","1124","1425","15,426","324","268","15,426","1366","75,1312","3086","73,2983","1367","1368","1124","1124","1,2,3,4,5,6,7","527","836,874","3690","28","67","268,1393","2123","3002","1124","3218","1366","15,426","1458","1458","39","2876","268","2123","603","1124","124","3889,3890","688","67","42","1124","3677,3678","1124","912","1254,3306","663,769","180","268","15,426","3660","558","3146","330","2093","1313","3660","1124","1312","1836","1367","1432","123","1829","137","1916,2718","1432","1010","1385,1396","1124","1124","330","1467","1124","2242","1507","85,86","1176","275","884","1387","2374","1639","514","1176,1396","611,612","268","1124","1922","268","1124","1124","73","1124","725","1432","1432","471","611,612","1368","454","663","1367","1124","73,123,1142","73","1715","1124","1124","2079","1681","107","769,3143","3492","137","1843","1843","268","1455","268","3084","137","1124","988,1396,2746,2747","268","137","1456","1432","1206,1292,1293,1294,1295,1296,1297,1298,1299,1300","3091","1124","611,612","471","1458","83,1424","690","96","1366","1124","268","912","454","1124","1455","74","1124,-1126","3706","1795","1455","1124","1396","1124","1124","1455","1975","73","137","268","268","1373","73,219,963,1385","663","268","221,1385","1124","1455","1455","1230","1455","67,3565","912","1193","1455","1124","268","28","502","1365","1202","1312","1455","73,124","584,585","769,3143","915","1455","1455","75","1124","998","1124","1124","2270,2271","1452","1176","663","1176","769,3143","73,90,1518,1520","1206,1292,1293,1294,1295,1296,1297,1298,1299,1300","769,3143","224","1455","34","3668","1660","71,73,90,663,1518","1364","1176","1176","663","1124","769","83","122","1455","1455","766,1124","1596","1458","1455","1455","1455","3492","1687","769,3143","28,793,794","1958","268","2002","1795","1312","1124","1124","1124","2963","2054","137","58","1087","986","268","1124","1458","1432","139","291","1219,1220,1221","3696","2131","1469","1124","3263","1368","1368","1124","900","1040,1041","1458","1124","1124","149","1312","1129,1130,1131","1432","533,1979","1432","1432","1124","324","268","1795","1124","1455","268","73,1396,1789,2742","268","268","73,2637","989","15,426","15,426","880,1124","137","3175","1467","1312","502,1110","2008","122","912","2754","878,909","563","2206,2207","1312","73","2558","1366","1312","90,769","324","3134","611,612","15,426","15,426","1458","184,268","4072","4060,4074","226","791","187,1367","1124","1290","1124","39,1458","1569,1570","896","369,1014","1366","1124","34","268","1922","67,178,1360,1361","88,248","611,612","15,426","122","15,426","14","1124","28","1124","3135","324,2934","1366","1368","67,158,159","1124","909","73,90,1372,1518,1520","1678","178","73,90,1176,1518,1520","766","1124","1124","268","846","268","3492","1455","206","1176,2993,2994,2995,2996","1124","90","1499,1500","831","1069","3702","137","15,426","268","1124","268","76,307","1124","603","1365","1124","379","2120","137","3206","1124","138","268","1312","1124","15,426","397","1124","453","1124","1151","83,1424","912","15,426","291","1124","1467","451","268","15,426","1124","67,124","291","791","1467","1458","1312","1455","537,538,541","73,1408","766","1455","268","1426,1427","3712,3713","1458","502","2061","2061","268","221","451","1365","2605","268","3589","268","1950","1124","1606","268","1679","556","1458","1458","83","769,3143","1458","886","3226","307,1195,1196,1197","1124","1124","1124","526","307,1195,1196,1197","1467","1319","1432","912","1124","1458","791","611,612","2276","307","73,219,963,1385","718,719","3740,3741","15,426","268","14","2382","1124","766","1124","502","67,1367","1367","59,307,963","1124","73,1176,2794","324","1312","3524","1124","73","636,2518,2519,2520,2521,2522","1124","1124","1124","1432","73,219,963,1385","1458","73,219,963,1385","1124","47","1432","791","1000,-3674","663","47,291","1524","912","2372","1342","307","498","137,869","2997","28,793,794","330","504,563","1124","268","73","88,248,268","1124","34,502","1124","34,73,83","137","1857","663","611,612","178,268","907","225,226","3118","1888","1124","324","1176","912","1787","15,426","268","3362","454","1499,1500","1499,1500","1499,1500","1499,1500","2137","74","1000,-3674","1124","1458","221,663,1176","1312","324,1202","454","1458","720","381","2966","481","912","611,612","1124","73","3421","15,426","1312","1093","2255","2255","3462","912","137","236,1104,1105","1365,1366,1367","1100","89","1080,1081","611,612","47,1458","1458","1458","15,426","563","1218,1823","83,324,987,1143,1144","1455","124,221,1385,2000","611,612","224","611,612","15,426","1420,3485","47","909","3675","1736","68","2251","1859","324","15,426","28,793,794","15,426","248","268","73","502","1124","1124","83,1743","308","1124","1124","73,-1174,1174","1312","912","88","791","268,2599","3703","15,426","611,612","1455","651","1499,1500","73,219,963,1385","221,268,1176","2065","268","73,219,963,1385","1972","1836","268","1124","1458","73,219,963,1385","31","1367,1861","1458","15,426","28,793,794","1124","268","1469","1412","912","912","800,3231","485","1312","1420","1458","1412","505","187","1124","451","1432","123","73,123,1211,1212","663","1312","938","1124","2937","1795","912","1124","912","726","745","31","1455","3102","1202,1426,1427","1453","1417","800,3231","1312","268","2913","912","1238,3335,3336,3337","175,1871,2188","268","1432","1124","663","611,612","268,762","1312","1124","2508","268","903","1124","1466","1124","122","1785","1124","1396","471","39","1366","73","74","1238,3275","2078","544","58,268","1056","663","224","107","1013","1312","912","1432","611,612","1124","39","611,612","1795","149","1455","221","1868","268","15,277,278","267","603","1369","912","899","3484","268","28","498","1010","221,1364","137","275","3646","248","1455","1124","1124","1124","1312","2505","270,368","1458","1042","1646","268","611,612","324","73","2925","73,1176","351","1124","3230","73,1180,1181","1153","67,178,1360","15,426","221","67,178,1360","493,494","93","995","2630","291","272","67,1367","1432","1365","1124","2558","1124","15,426","2164","1412","1843","1843","755","1124","1124","2823","1432","268","1124","912","1082","1432","471","1124","2002","1467","268","1870","1458","324","1124","1124","84,268","1467","912","39,925,1312","1804","137","1455","1432","74","324","73,124","611,612","268","106,107,520","15,426","663","1432","268","1124","1455","1124","28,793,794","1467","1455","1124","662","73,624,1711,1712","1455","1455","1124","1469,2909,2910","1455","663","1124","1432","139","2545,2568,2569,-2571","88","1455","1455","485,913","769","1372","1455","1432","1455","1458","1455","1458","1455","769,3143","1226,1227","1367","73,90,1518","1432","1455","1455","1124","221","912","1124","73,90,663,1518,1520","1432","1366","1124","896","1320","67,123,430","1432","1467","291","1432","1456","137,268","268","1467","618","330","3660","1365","1432","1124","28,793,794","1312","1129,1130,1131","1458","471","1458","1124","268","642,764","1124","1367","42,1396,1789","146","343","268","1124","1366","1367","3525,3526","912","1124","34","1048","268","268","912","221,268","1432","2133","67,1367","1452","912","912","172","268","28,793,794","73","874","206","1124","96,268,311","1425","198","1087","268","221,1124","15,426","15,426","3751,3752,3753","817,818","1626","2898","73,90,1176,1518,1520","1109","1176","42,1366,1367","73,1366","324","3494","1312","28,793,794","611,612","1455","566","1467","966","3686","-4081","1206,1292,1293,1294,1295,1296,1297,1298,1299,1300","663,2279","1312","3534","3065,3066,3067,3068","73,451","324,1439,2114","1124","1124","72","611,612","611,612","2557","611,612","2490","324","1366","1247","1312","568","307","330","73,90,1371,1518","558,846","3107","1061","2558","137,268","1011","1458","268","68","1365,1366,1367","72,887","1124","268","87","766","611,612","1367","1124","268","1369","568","73","1124","139","1458","912","1368","1467","887","73","611,612","137","34","73","83,1424","556,812","1124","1312","137","15,426","912","1430","3534","67,124","47,1458","1458","1458","3683","1124","3492","268","268","3492","1124","1124","1124","912","2061","1124","268","79,80,81","121","124,651,855","137","1458","58","912","1432","268","3763,3764","1795","1365","887","558","3134","1124","171","1432","1455","67,1367","554","268","1366","324","611,612","1432","474,1096,1205,1206,1207","1078","912","1312","1387,2161","73,149,173","1124","1467","-3511","694","800,3231","1124","324","2447,2448,2449","1312","1124","139","1124","283","28","663","502,1065,2414,2415","2564,2565","1412","3002","1000,-3674","1000,-3674","1000,-3674","3660","73,2789","369","73,219,963,1385","2940","1564","1527","1458","1124","2300","1458","2835","268","502","1124","728","73,716","73","1369","611,612","324,2114","1176","1452","1781","324","268","502","299","529","1001","248","219,761,1367,1504","1124","15,426","1124","15,426","1312","15,426","137","3712,3732","568","15,426","912","1499,1500","-410,1499,1500","1499,1500","1499,1500","1499,1500","1000,-3674","1458","1458","267","1124","451","3636,3637","1000,-3674","912","912","912","28,793,794","1467","1458","663","3984","887","1925","1467","2876","1312","1124","912","451","1124","1218,3908","1636","1124","221,1346,1405,1761","611,612","1432","485,1239","1124","1124","73","1368","2984,3641","836","1432","137,178","1455","1467","291","611,612","15,426","73,219,963,1385","1124","836","1458","1432","124","1124","268","1890","1467","1124","1124","1124","909","42","642,977","611,612","73,219,963,1385","1432","1972","268","912","912","912","1467","1467","15,426","1312","912","1124","1124","1124","654,655","252,302,654,655","454,508","2847","1124","1455","2875","73,219,963,1385","1290,3383","378,1432","766","1494,1495,1496,3596","324","1124","1124","15,426","268","28","2101","3570","611,612","1420","603","1843","1458","268","73,219,963,1385","1752","305","65,874","913","1312","1833","3660","1124","39","1367","1574","1432","3276","291","72","1432","677,678,679","1124","15,268","1696","1660","1124","3434","137","88,248,268","268","53","139","1312","53","725","846","15,234","268","267","526","83,1131,1182,1183,1184","268","1239","3730,3731","1499,1500","2872","1385","2621,2622","478,1822,2297","603","611,612","611,612","268","268","221,1124","137,268","603","603","722,1124","124,184","1124","1124","1110,1124,1204","268","1843","68","1458","171","268","1366","913,1563","1469","912","90","1176","73","1124","887","1312","1124","254","1124","1455","766","909","1124","1124","299","2958","379","2386","1124","1367,1372","1124","611,612","611,612","1124","1124","1432","1455","294","44,45,46,1124","1455","2370","1455","1455","1455","663","3285","769,3143","2506","1458","268","1455","268","1432","1420","1079","-2431,-2440,-2441","769,3143","221","1124","1775","454","1467","1176","912","3099","1365","73,90,1371,1518,1520","1524","769,3143","73,90,1371","1368","1455","73,219,963,1385","1455","83,324,2276","15,426","73,367,1367","1366","73,90,663,1518,1520","1124","14","1367","3865,3866","330","1124","1458","806","1432","607","2817","1432","471","1432","1413","348,349","1467","1366","1124","533,1979","1432","73,219,963,1385","1028","1527","1124","611,612","611,612","268","1564","702,2388","862,863,864,865,866,867,868","15,426","1124","28,793,794","1124","766","1365","2748,2749","2801","1312","912","1467","1365,1947","73,219,963,1385","524","73","1124","2823","1124","122","1396","73","67","73","1176","1458","1124","1176","1312","1312","883","1458","912","1458","1439","1079","3490","1124","67,178,1360","846,1124","268","1833","611,612","611,612","611,612","291","1458","1458","739","268","73","791","73","2365","544","1124","107","445","1833","72,73","268","1124","1124","611,612","1239","1332","1332","1124","1124","2514","766","1124","611,612","1124","73,139,324","1467","68","1432","911","1458","603,1700","2804","221","2187","268","15,426","1458","1129,1130,1131","28","67,1124","986","1124","330,516","1124","330","1455","526","1458","268","1828","344","268","268","1458","73,219,963,1385","73","1124","1467","1365","1432","1457","1176","663","1124","563","1458","1795","1467","1124","107","663","2441","1124","1458","73,219,963,1385","1124","122","73","1124","-3511","268","1458","563","1458","2280","896","221","1124","324","73","1124","268","268","49,1312","663","1458","1458","858,859","330","1458","268","3291","73","178","1312","268","73,2087","663","28,793,794","73,1857","3246,3247","1897","702","324","139","522,663","31","15,426","1691","502","1124","34","1426,1427","1366","73,1176","1186","268","218","1124","451","1499,1500","1499,1500","1499,1500","1499,1500","1499,1500","1499,1500","1455","628,629","241","73,2087","1124","519","1365","74,139","730","268","1432","912","743","1458","1458","1366","47","1124","1124","1458","28","1458","268","1124","28,793,794","1312","137,887","1456","28,793,794","1124","611,612","611,612","47","1124","3487","1458","1312","1222","556","1366","28","1124","1420","651","73,219,963,1385","1455","73,219,963,1385","912","1312","1124","379","3231","1458","800,3231","800,3231","800,3231","2115","1124","83,1131,1182,1183,1184","74","28","2008","887","3159","28,793,794","1100","1367","139,507","1532","1444","330","1109","1458","1124","3407","73,219,963,1385","268","15,426","912","1426,1427","1312","1432","1458","663","611,612","603","1453,1455","1467","1312","1364","1023","1307","67,397","28","563,1124","1124","2290","124,139,268","1690","73,107,438","1124","1458","1008,1009","705","1458","757,1312","1312","611,612","307,1524","2620","1124","75","1467","15,426","15,426","611,612","14","471","716","1458","34","330","583","945","-2677,-2678,-2679,-2680,-2681","3333","3818","73,1176,2717","34","287","1124","106,1352,1353","603","299","1124","73","291","268","1843","1124","1290","31,748","1498","14","1467","1312","379,1124","49,52","1312","90","1366","501","1096,1097,1098","1124","28,793,794","107","1312","1455","3896","3714","1124","73","1458","1455","1455","1458","73,268","3770","268","1432","611,612","769,3143","1455","1129,1130,1131","1432","1206,1292,1293,1294,1295,1296,1297,1298,1299,1300","73,219,963,1385","306","88,307,598,1367,2219,2220","73,90,663","1458","3280,3281","1124","1124","1455","1124,2827","291","1124,1417","73","268","1432","1432","1385","1025","739,3869","1769","1432","1458","1432","1825","1456","451","28,793,794","268","769","137","73,219,963,1385","1238","1646","2642","2878","1124","28,793,794","912","1328","268,1328","67,400","58,178,268","1436","1412","454","1312,1317","900","75,663,3075","149,745","73","1366","3483","3404,3446","454","1312","611,612","502","1458","137","1458","1124","1368","1124","1347","268","426","1,2,3,4,5,6,7,-74","28,793,794","1455","42,495","1124","587","729","1420,3485","68","1365","2168","1312","139","1091","330","1420,3485","268","330","1124","1534,3217","268","268","139","1124","47,1458","846","1022","912","611,612","268","206,1583,3147","563,2041","1412","1432","1385","73,219,963,1385","1458","3634,3635","83,1082","1457","1458","1432","1091","73,1176","1034,1783","1555,2533","73","1432","1124","1124","800","1124","149","28","3172","1426,1427","2051","268","1124","1458","1107","4007","1124","1124","1432","1124","2371","42","520","1458","1458","1000,-3674","2234","2234","268","28","2110","1458","1124","171","74","268","611,612","2593","1458","15,426","1124","1312","74","1499,1500","1499,1500","-410,1499,1500","1499,1500","1499,1500","1499,1500","1499,1500","1499,1500","1499,1500","1499,1500","1091","1412","88,248,268","1124","291","137","1312","268","15,426","1312","1124","912","1432","47,1458","461","1458","1432","1312","1458","1312","1124","1455","611,612","268","1124","2173","1124","846","1458","1986","1124","83,1424","1124","642,2768,2769","651","73,219,963,1385","65,1583,3524","1110,1124,1204","912","1124","1124","912","912","912","556","1124","1124","297","1458","15,426","611,612","73,149","912","139","1782","1337","1455","1365","73,1574,1599","1124","912","259","1124","268","122,380","216,714","1124","3215","226","2005","1124","268","1124","1367","912","603","3463","1566","766","1312","769,3143","330","951","1412","1892","603","1795","2505","3763,3867","1432","912","3166,3167","1843","1843","471","1176","887","2135","1124","1458","1312","471","3268","1458","1098,1108","1085","1489","178,268","268","122,323","912","1455","896","1412","1455","1686","769,3143","1455","592","802,946","268","268","1455","1467","1458","1458","1124","330","3495","1124","1124","73","1458","1455","973","1176","1176","1752","149","1455","15,426","1124","73,90,663,1518,1520","90","251,252","1412","1124","1098,1108","580","1421","1124","1415","2781,2782,2783","1124","1432","1458","1124","1456","1456","324","1458","1458","471","2744","1124","887","74","68","471","1932","1137","324","1432","15,426","73,219,963,1385","73","1803,1804","3075","268","706","73,663","268","1365","1458","1432","1312","1312","149","471","1312","1124","1458","1124","3888","3251","146","1412","297","45,73,855","1366","89","3166,3167","88","132","451","268,663,1124","769,3143","2684","241","73,1176,2794","73,219,963,1385","1453,1455","1795","1364","397","1458","268","1458","887","535","1124","268","73,219,963,1385","153","1432","139","307","1368","3871,3872,3873","2868","299","881","2172","1188,1189","178,268","1176","268","1455","1455","2055","1176","1100","221","1458","1124","1124","31","1312","330","74","1,2,4,2596","1452","611,612","107","2895","1455","611,612","663","1124","2371","2371","603","1499,1500","1499,1500","1499,1500","1499,1500","1499,1500","73,219,963,1385","1458","1063","1312","268","123","1458","268","267","2423","1124","1124","611,612","1467","2534","268","268","611,612","912","912","912","451","1458","2769","73,219,963,1385","1455","122,144","603","912","912","912","1124","73,219,963,1385","1673","961","1396","1124","1458","1778","1598","912","1458","1458","123","73,219,963,1385","1124","3840","1124","2540,2541","73,219,963,1385","1124","1432","451","1010","912","1206,1238,1284,1286,1292,1293,1294,1295,1296,1297,1298,1299,1300","1124","1432","73,219,963,1385","903","1458","83","1124","73,1365","1124","1124","611,612","1228","1088","1432","723","912","583","1806,3592,3595","1432","603","3670,3742","297","912","1499,1500","1499,1500","1843","1458","471","1606","28,793,794","1124","268","47,1458","1455","1455","1312","1412","268","73,219,963,1385","139","1096,1131,1219,1220,1221","31","1455","1458","1752","712","1312","31","28,793,794","3817","1637","1124","1467","28","268","2738","1458","769,3143","34","1010","983","766","324","769,3143","451,1290","3776,3780","1458","1458","1922","268,1124","580","1124","139","1312","73,1379,1520","451","73","58","1458","1412","1499,1500","75","268","1312","4067,4068","1432","73,219,963,1385","1499,1500","28,793,794","1124","1458","1312","1432","3166,3167","2280","73,219,963,1385","580","1432","461","886","1486","3267","1124","451","1458","307,1176","3231","-1150","28,793,794","268","3826,3827","139,153","1432","137","1486,1487,1488","1366","1124","1452","1455","1124","1124","268,578","1124","1974","1499,1500","1499,1500","1499,1500","1499,1500","1124","1312","1458","1432","73,219,963,1385","2533","291","73,149,1366","1124","268,1927","912","2097","737,921","1364","73,219,963,1385","379","28","297","603","1458","1091","73,219,963,1385","1432","3131,3540","1124","3544","267","73","73,219,963,1385","1662","451","330","1010","2063","2515","912","1312","1176","1124","1312","1124","206","49,1458","1458","268","556","2941","1124","73,219,963,1385","569","1450","912","1413","90","695","73","73,2717","478","478","1124","603","603","1432","451","1467","3232","28,793,794","137","324,2425","1432","1499,1500","73,219,963,1385","73,219,963,1385","69","1091","583","268","268","72","1412","1124","1124","1082","1432","1458","73,90,1518,1520","1458","1124","1124","1098,1108","888,1312","28,793,794","291","1124","1458","1458","955","2159","1124","451","139,766","42","1312","1458","1458","1124","611,612","1458","1367","1412","2936","533","73,741,742","1312","2036","73,1368","330","1124","1124","1176,2953","912","1312","1458","67","1124","1124","2416","1366","1176","268","83,1424","1124","184,297","2277","28,1124","1455","39,1432","1455","297","1124","1124","73","1996,1997","2321","73,219,963,1385","1458","1312","268","124","603","1124","1124","745","1499,1500","1499,1500","1499,1500","1499,1500","502,986","1312","1312","1432","1458","153","3166,3167","1153","268","1124","83,1424","1366","1124","329","73,219,963,1385","73,219,963,1385","1499,1500","568","73,219,963,1385","1312","1458","74","1312","1365,1366,1367","611,612","1432","1432","451","1312","1124","1312","1375","1432","1634,1635","1458","2620","1124","1312","215","3868","1499,1500","121","3450","478","3286","603","302","1499,1500","68","663","1458","1124","912","1038","299","766","1455","268","1455","1091","1458","1627,1628","1455","73,219,963,1385","909","1321","28","1467","1124","1458","1432","15,426","1907","2912","2412","268","3744,3745","1458","1458","1366","1364","1458","83,1131,1182,1183,1184","3600","3482","268,1868","955","34","1312","1432","1432","2307","1176,2993,2994,2995,2996,2997","73,219,963,1385","1124","988","3166,3167","83,1424","3489","1010","2097","268","68","1124","1918","913","1124","324,2114","900","677,678,679","1721","122","1499,1500","1499,1500","1499,1500","1499,1500","1499,1500","1499,1500","3701","1124","1748","47,1458","1432","15,330","139","1458","1564","1458","2620","1312,2785","291","268","1124","839","1458","1432","556","1083","267","1499,1500","2900","1368","75","485","1124","1124","471","1124","28","73,2416","144","1627,1628","73,478","268","240","1238","1010","28,793,794","1124","1426,1427","73,316,317","1868","451","1960","949","73,2087","73,2087","1499,1500","1124","299","28,793,794","1458","73","773","1124","1458","1124","1458","912","28","171","745,991,1367,1372","1124","1124","1458","3231","1458","580","1124","1312","451","1499,1500","1499,1500","1458","1312","3692","3416","1804,1807","171","73,219,963,1385","1365,1366,1367","1458","3166,3167","1564","1365","3234","162","2620","846","1499,1500","1368","769,3143","2842","74","1412","1458","1312","846","1124","47,1458","3716,3717","766","1124","2442,2443","1366","1010","34","1432","1312","1312","1432","1124","1458","1124","3864","2298,2299","1499,1500","1124","3166,3167","1458","1124","1575","67","3231","1396","1124","236","1499,1500","83,523","31","1458","379","73,219,963,1385","1124","267","451","1455","3125","1124","454","1499,1500","28,793,794","1458","73,219,963,1385","1458","73,1176,2794","1458","1458","1124","39,1458","16,17,30,31,3574","769","73","73","1124","1432","1458","1795","1124","1124","18,19","1124","1499,1500","3166,3167","94,123,430,1368","28,793,794","1124","1124","42,267","3166,3167","3166,3167","299","3085","324","422","1091","324","268","1176","1458","73,855,896,1411","275","451","1091","776","1458","1458","2795","1124","1458","1367","3166,3167","2274","73,219,963,1385","28","1046","2566,2774","1124","267,745","1458","1458","1010","3166,3167","1045","1458","1176","1458","139","3166,3167","1124","3166,3167","1458","1368","2106","1455","1010","3166,3167","745","1312","451","451","73","1691","73,75","3166,3167","268","637","1124","3168","1312","1124","275","1124","1458","485","88,267","1499,1500","65,1283","1458","559","3166,3167","1499,1500","149","568","2999","3926","1124","218","74","3166,3167","1458","1564","590","461","1458","268","3166,3167","3491","1458","1124","3166,3167","1124","3757,3758","73,2087","275"];
        for ( const i of todoIndices ) {
            for ( const ref of JSON.parse(`[${arglistRefs[i]}]`) ) {
                todo.add(ref);
            }
        }
    }
}

if ( $hasRegexes$ ) {
    const scriptletFromRegexes = /* 9 */ ["tamilpri","(\\d{0,1})?tamilprint(\\d{1,2})?\\.[a-z]{3,7}","324,1176,2139",".com/e/","^[0-9a-z]{5,12}\\.com\\/e\\/[0-9A-Za-z]{10,15}$","1523","-embed.c","^moon(?:-[a-z0-9]+)?-embed\\.com$","3190,3617","moonfile","^moonfile-[a-z0-9-]+\\.com$","3190,3617",".","^[0-9a-z]{5,8}\\.(art|cfd|fun|icu|info|live|pro|sbs|world)$","3190,3617","-mkay.co","^moo-[a-z0-9]+(-[a-z0-9]+)*-mkay\\.com$","3190,3617","file-","^file-[a-z0-9]+(-[a-z0-9]+)*-(moon|embed)\\.com$","3190,3617","-moo.com","^fle-[a-z0-9]+(-[a-z0-9]+)*-moo\\.com$","3190,3617","filemoon","^filemoon-[a-z0-9]+(?:-[a-z0-9]+)*\\.(?:com|xyz)$","3190,3617"];
    const { hns } = scriptletGlobals.origins[0];
    for ( let i = 0, n = scriptletFromRegexes.length; i < n; i += 3 ) {
        const needle = scriptletFromRegexes[i+0];
        let regex;
        for ( const hn of hns ) {
            if ( hn.includes(needle) === false ) { continue; }
            if ( regex === undefined ) {
                regex = new RegExp(scriptletFromRegexes[i+1]);
            }
            if ( regex.test(hn) === false ) { continue; }
            for ( const ref of JSON.parse(`[${scriptletFromRegexes[i+2]}]`) ) {
                todo.add(ref);
            }
        }
    }
}

// Execute scriptlets
if ( todo.size && todo.has(0) === false ) {
    const arglists = /* 4091 */ ["","0,0,1","0,2,1","0,3,1","0,4,1","1,5","2,6,7,8,9","1,10","3,11,8,12","4,13,14","5,15,16","1,17,18","4,13,19","5,20,21","6,22","7","0,23,24","6,25","0,26,7","5,27","8,28","1,29","1,30,31","1,32","1,33","9,34,7,8,35","10,36,37,38","11,36,8,39","8,40","8,41","4,7,27","12,27","13,42","12,43","12,44","8,45","1,46","1,47","14,7,21","8,48","15,49","0,50,1","16","8,51","13,52","6,53","4,54,55","15,56","13,57,48","8,58","8,59","8,60","15,61","8,62","4,54,63","4,13,64","12,65,66","8,67","8,68","15,69","17,70","0,71,72","13,73,74","13,75,76","14,77,78","17,79","8,80","8,52","4,13,81","8,82","8,83","13,84,85","8,86","18","19,87,88","20","13,57,89","15,52","15,90","8,91","8,92","4,13,93","4,13,94","17,95","0,96,97","0,98,72","6,99","13,57,100","13,101,102","8,103","8,104","13,57,105","15,106","15,107","13,108,109","8,110","4,7,77","13,57,111","4,7,112","13,113,114","8,115","12,85","13,116,85","15,104","8,42","13,117,118","8,119","8,120","15,121","15,122","13,123,124","14,125,126","19,81,127","21,128","8,129","4,130,131","8,132","13,57,133","13,57,134","13,57,1","8,135","8,136","22","0,137,138","8,101","13,81,52","8,139","8,140","8,141","0,142,7","0,143,138","15,144","0,145,97","15,146","15,147","15,148","0,149,97","8,150","13,57,112","8,151","15,152","8,116","21,153,154,155","0,156,157","14","15,158","4,7,52","8,159","0,160,138","8,161","23","13,119","8,162","13,163,164","15,165","5,166","13,57,167","22,168","8,169","8,170","15,171","12,172","0,136,97","8,173","12,174","8,175","0,176,72","0,177,97","15,178","4,54,179","4,180,181","13,116,182","15,183","13,75,184","0,185,157","0,186,7","0,187,7","0,188,189","4,190","12,191","8,192","12,193,194","0,195,97","8,196","4,7,197","13,57,198","0,199,7","8,200","19,28,201","4,13,202","24,203","4,204","19,116,205","12,206,66","0,207,72","8,208","0,209,72","0,210,211","19,73,212","14,213,214","14,215,66,216","0,217,97","12,218,24","0,219,72","0,220,211","8,221","0,222,138","13,223,89","0,224,97","13,117,225","15,226","0,227,228","4,7,229","8,230","12,231,66","13,84,66","12,232,233","8,234","13,235,102","0,185,1","0,236,97","13,116,237","5,77","4,7,238","8,239","15,240","0,241,138","8,242","13,243","13,235,244","13,245,246","8,185","4,247,248","12,249","8,250","8,251","25,252","8,253","8,254","8,255","0,256,72","13,123,1","0,257,72","15,258","14,259","22,260","12,73,261","8,262","8,263","8,264","13,113,265","15,266","15,267","0,268,138","12,269,270","0,271,97","0,272,138","22,273,274","13,80,222","4,13,275","22,276,194","15,277","15,119","8,278","4,54,248","8,279","0,280,138","4,13,194","13,281,181","13,235","8,282","13,283,284","15,285","4,13,27","13,117,286","8,287","0,288,138","8,224","12,281,66","13,101,235","8,289","15,290","12,291","12,292","8,146","25,119","0,293,7","12,113,24","4,294,295","4,7,249","13,117,169","13,169,296","8,297","8,298","8,299","0,300,97","0,185,72","12,269,194","8,301","4,13,269","4,302,303","13,304,128","15,305","21,306,307","12,308,261","13,309,310","0,311,138","18,238","8,222","13,312","4,7,313","8,314","0,163,97","4,315,316","15,317","12,318,319","13,224","13,84,320","6,321","13,322,323","12,324,194","4,13,325","13,57,326","0,42,97","6,95","12,327","4,7,328","12,328","4,329,7,330,331","13,57,44","15,151","12,332,333","4,334,335","12,336,16","13,84,73","12,337,194","18,338","13,117,339","18,340","0,341,342","0,343,7","8,344","15,345","13,123,222","0,346,72","8,347","22,348,194","8,349","0,350,138","17,351","12,352","14,353,78,354","0,222,72","0,355,7","1,78,356","18,7,357","13,358,235","13,169","15,359","17,360","0,361,1","13,57,362","0,363,138","0,136,72","8,364","12,324,365","12,366","8,367","4,334,368","8,369","17,370","0,371,72","8,372","13,81,169","4,247,373","0,374,97","18,375","13,101,376","8,56","6,377","0,378,138","8,379","13,123,380","17,381","0,382,72","4,7,383","15,384","12,385,333","13,57,386","8,387","22,7,388","8,389","22,7,7,24","12,390","13,123,391","17,392","13,393,125","13,57,393","8,394","19,339,395","4,130,396","4,334,397","13,170,398","8,399","4,130,77","13,84,400","8,401","15,402","12,77,194","8,403","13,113,116","15,169","21,404,405","13,406","13,235,101","13,81","13,407,408","15,102","21,409,410","8,411","8,339","5,412,66","12,413,414","13,57,415","8,416","0,169,211","8,417","4,418,238","0,419,97","8,178","8,420","15,421","21,422,423","22,424,78","0,425,138","0,426,72","4,54,427","12,428,16","13,178","8,429","4,13,430","13,431","0,432,1","8,433","13,57,52","4,13,434","17,435","15,425","12,436,24","22,437","13,123,438","13,439,440","0,441,138","8,442","8,443","8,444","12,445,66","15,446","12,447","5,448,66","15,449","12,77","0,450,138","18,451,357","13,123,452","15,453","0,235,72","4,7,454","8,455","0,456,72","12,457,189","0,458,72","13,123,413","0,459,72","17,377","4,334,460","13,108,102","13,407,461","8,462","14,463,126","8,464","8,240","13,57,465","0,222,189","0,466,189","12,222","12,467","21,468","15,469","1,470,471","13,472,396","12,57","12,473,66","15,250","15,474","12,428","13,123,475","0,476,24","0,413,97","15,477","4,54,478","8,479","13,480,252","0,481,97","15,482","12,27,24","4,7,483","12,484","0,485,72","13,117,486","0,132,189","13,84,487","13,84,488","15,489","13,170,487","13,75,490","8,491","19,108,492","12,493,494","5,495","21,306,496","15,497","13,116,498","12,22","13,117,499","4,54,77","0,500,138","6,95,377","8,456","12,501,16","8,502","8,503","8,504","12,112","8,505","15,506","0,507,157","13,508","13,81,128","8,509","0,510,97","19,511,127","0,512,7","0,513,1","0,132,138","12,428,21","8,514","13,123,515","0,516,97","13,123,517","13,123,518","12,519,194","12,520,66","8,521","15,522","13,57,523","13,57,524","13,57,515","12,516","13,123,525","13,57,526","13,123,527","15,528","6,413","6,79,529,530","12,211,126","4,13,531","4,13,532","13,113,269","12,324,533","12,534,333","22,476","0,535,24","8,536","12,537,533","12,324,538","4,54,373","18,539","15,101","8,540","0,541,138","13,57,222","6,542","12,543","4,544,545","12,546","0,547,72","13,57,548","12,324,66","13,116,549","13,108,235","0,550,97","15,551","14,552","15,553","13,304,182","15,554","0,555,138","0,151,72","0,556,72","12,339,533","12,89","15,557","12,558","0,559,72","12,560,194","0,561,97","15,555","4,13,562","5,324,261","8,563","8,564","4,565,566","15,567","8,568","19,116,127","21,128,569","14,206","15,570","0,571,97","13,87,244","13,57,572","5,573,574","0,575,7","8,102","13,57,576","0,528,97","0,577,97","12,578","17,413","12,579","13,439,54","13,123,580","13,581,310","8,582","18,583,24","0,584,97","0,309,97","22,260,78","0,585,138","4,130,586","12,587,274","0,588,138","12,589","14,7,7,354","12,590,16","12,591,21","4,54,592","8,184","0,593,24","0,446,72","8,594","22,259","12,595","22,7,7,354","0,596,24","4,54,238","8,597","8,598","13,151","13,57,599","18,600","8,108","13,601,602","13,245,383","22,603,66","15,604","4,605,383","0,606,72","13,607,515","0,608,24","4,54,609","18,222,189,610","6,611","4,54","0,612,138","13,613","13,614","13,615","13,616","4,334,617","8,618","12,619,189","18,620","13,469","8,621","18,622","0,623,72","8,624","8,625","12,626","0,627,72","5,628,66","4,247,629","0,630,138","8,631","13,117,396","13,339,632","15,633","0,112,138","8,634","13,439,635","8,81","0,636,7","0,637,7","0,638,138","19,235,127","8,522","12,639","13,123,640","13,235,240","13,641,77","12,642","17,643","17,644","12,580,194","19,75,127","8,645","4,334,646","12,646","13,57,391","12,511,66","0,647,24","0,648,97","0,649,97","0,650,138","12,222,651","4,652","8,653","12,654","12,211","13,116,655","13,84,656","8,657","8,658","8,659","13,245,249","15,660","0,661,228","8,662","13,116,663","13,75,664","8,665","0,666,97","0,667,97","26","0,668,211","19,123,669","0,670,97","0,671,138","14,206,66,216","15,672","8,396","8,673","12,27,233","13,123,674","13,116,675","13,123,676","15,677","8,527","13,439,269","18,53,189","8,678","21,306,679","8,680","4,53,383","5,681,66","12,682","13,407,683","8,684","0,685,138","0,686,138","12,687","8,158","8,688","4,13,689","4,690,77","8,691","0,692,97","13,124,405","8,693","8,694","0,659,72","8,695","25,696","8,697","15,698","0,699,97","8,700","15,701","0,702,189","25,413","21,703,704","13,454,490","13,655,490","15,705","0,151,138","8,706","15,707","12,708","0,709,97","13,169,306","8,710","13,711","13,439,712","0,713,157","13,304,714","13,607,715","12,716","6,717","13,117,1","12,718","15,719","15,720","4,334,721","15,722","13,57,486","13,723,580","13,116,580","8,724","13,123,725","18,726,357,610","15,222","0,727,97","15,728","4,729,730","13,57,731","12,324","8,732","1,733","5,734","13,607,735","8,736","13,116,197","8,737","0,738,97","12,486","19,14,739","12,740","8,741","12,742","12,743,194","6,744","0,575,1","13,156","4,7,745","8,425","21,746","8,747","13,240,184","13,748","6,749","8,750","12,751","0,752,7","4,565","0,753,97","15,754","12,755","5,755","4,54,756","8,757","13,758","13,116,759","4,7,89","8,760","5,155,365","5,761","0,762,1","4,763,295","13,120,764","4,13,714","13,123,765","12,766","0,767,97","15,768","12,769","12,7,189","4,7,770","0,69,97","12,1","12,528,189","13,57,771","15,532","13,57,772","13,117,737","12,425","0,773,7","8,774","0,775,72","8,776","13,117,222","22,777","14,777","8,778","13,108,779","12,269","4,7,780","0,151,97","13,511,735","13,117,626","22,781","0,782,24","12,783","17,79,529","8,784","12,785,194","5,383","5,391","8,786","1,787","22,7,78,24","0,136,157","12,619","4,54,396","13,57,84","13,123,788","13,57,413","13,117,391","13,57,789","8,790","13,75,249","13,57,607","0,791,97","17,792","0,793,342","17,794","0,795,138","19,796,797","1,798","0,799,1","0,800,138","0,801,72","4,802","1,17,803","12,804,270","13,805","13,84,806","13,807","4,690,731","8,808","13,57,809","12,810,24","12,269,811","4,13,1","0,812,138","4,334,710","0,813,342","4,13,383","12,814","4,334,169","13,57,815","13,123,816","0,817,97","0,22,211","13,116,222","17,818","22,819,66","12,820,24","8,551","5,681","5,405","4,821","13,220,683","8,822","13,57,169","8,823","0,824,138","12,218,494","0,825,97","0,826,97","18,827","13,828,396","27","15,829","13,480,486","13,57,830","21,831","25,366","4,54,832","8,692","13,57,833","13,75,102","13,57,81","4,54,7,330,834","12,835","17,22","0,836,72","8,507","8,837","0,838,97","13,456","13,839","21,306,840","21,306,841","21,306,842","13,75,843","8,844","8,845","13,108,846","4,7,44","4,463,181","12,847","19,509,848","0,849,211","12,383","13,281,850","8,851","8,852","21,468,853","13,113,440","12,854,16","13,73,855","13,57,856","12,857","4,7,413","8,751","13,57,858","15,859","4,54,860","0,861,97","12,772","4,13,862","5,22","0,863,97","12,864,66","6,865","0,866,138","13,57,783","13,117,783","12,867","1,868","12,864","4,13,869","0,870,97","0,871,97","13,81,222","0,872,138","8,807","8,873","8,874","13,116,875","0,52,1","8,876","0,877,211","13,113,878","13,117,54","0,879,97","13,102,88","12,431","4,7,169","12,880","18,881","12,882","22,276,78,216","8,768","0,883,211","0,22,157","0,884,1","8,885","18,886","12,887","12,310","22,888","0,151,211","4,334,486","0,889,189","8,890","8,124","0,891,138","8,892","8,893","13,235,77","12,527","8,894","0,769,138","1,895","4,896,897","12,898,24","12,413","13,57,899","4,900,901","4,334,425","19,240,127","14,7,21,24","8,90","8,902","0,903,97","8,904","18,905","21,906,907","13,113,783","13,113,908","13,113,111","13,439,425","5,558","0,584,138","15,909","0,910,1","8,911","22,463,78,354","12,527,194","0,912,157","22,348,78,354","0,913,24","14,914,78,216","22,915,78,216","22,916,78,354","14,917,78,354","8,909","22,463,78,216","4,918","4,431,919","22,920,78,354","25,921","1,922","14,923,78","0,924,97","13,113,925","13,150,262","13,81,22","1,926","1,927","1,928","25,929","22,930,78,216","12,931","6,932","13,933,934","12,935","6,79,7,936","0,937,157","13,933,558","6,938","4,13,939","13,113,934","13,113,413","18,940","0,941,97","8,942","21,943,944","21,943,945,946","21,947,948","4,431,949","6,950","22,437,78,216","8,614","19,73,951","12,952,953","22,916,78,216","14,954,78,216","22,348,78,216","4,334,313","12,815","8,955","6,956,7,936","4,54,957","4,958","4,13,959","21,306,960","4,334,961","4,334,428","12,77,16","15,962","21,906,7,946","18,963","0,403,1","14,964","0,965,138","0,966,72","0,616,72","4,967,248","4,968,969","14,7,78,970","4,54,971,330,972","17,973","13,974,975","4,334,976","12,521","5,265","22,977,78,216","14,731,78,216","15,933","19,28,978","8,979","22,916,66,216","22,916,980,216","13,116,961","8,615","22,647,78,216","0,981,97","4,982,983","0,527,984","25,27","8,985","6,986,987","22,463,78","14,463,78","4,13,988","8,989","21,128,990","25,586","19,123,425","18,7,651","14,463,78,216","19,991,992","0,993,228","4,54,994","14,731,78","25,995","4,334,996","4,54,997","4,54,7,330,998","8,939","8,999","6,1000","17,1001","25,22","6,1002","18,1003","22,7,78,354","14,7,78,354","6,22,1004","0,1005,211","13,358,1006","4,54,1007","0,1008,342","0,1009,342","12,1010","6,1011","12,1012","13,281,1013","4,334,1014","4,54,116","0,1015,1","4,334,52","6,1016","6,1017","0,1018,1","22,276","0,1019,97","21,306,1020,946","4,54,1021","22,276,66,216","4,431","14,7,233","13,84,594","19,304,425","0,1022,1023","13,235,1024","12,428,261","22,276,66","14,206,66","13,991,607","6,360","5,940","13,84,1025","13,358,655","4,54,52","4,54,1026","4,54,1027","4,54,1028","10,1029","10,1030","6,1031","21,947,1032","4,54,197","4,54,714","18,1033","8,235","13,235,1034","13,312,1035","0,1036,97","8,1037","0,1038,7","18,1039","4,54,1040","4,54,1041","5,1042","13,116,425","19,123,1043","9,1044,7,8,1045","18,1046","17,749,529","18,7,357,610","22,1047,78","6,1048","12,1049,270","12,1050","22,1051,78","12,804","4,968","28,182,1052","13,1053,1054","13,1055,1054","19,439,1056","19,1057,1056","0,1058,72","0,1059,72","4,54,1060","18,1061","21,1062,1063,155,1064,357","21,1065,1066,155","22,348","6,1067","0,1068,189","18,1069","4,334,1070","13,116,1070","4,13,1071","13,116,1072","12,1073,16","12,1074,357","12,1074","0,1075,72","12,1076,357","0,1077,138","12,1078","8,1079","19,75,498","19,607,1080","19,607,1081","19,607,1082","13,84,1083","0,1084,342","0,1085,72","13,1086","1,1087","4,54,181","13,235,1088","13,1089,1088","15,456","4,7,181","13,57,181","13,1090,723","4,7,1091","13,84,237","13,1092,237","13,116,1093","13,116,1094","4,13,1095","13,116,1096","12,1096","0,1097,72","13,116,237,1098","13,116,1099","25,237","13,150,1100","8,1101","18,1102","8,1103","4,7,179","12,1104","19,116,1105","0,1106,7","8,1107","15,1108","13,262,119","5,53","0,1109,1","12,714","15,1110","12,716,194","29,1111,1112","13,75,1113","13,358,602","13,1114,602","4,7,602","13,75,602","13,108,1115","19,607,1116","13,358,723","13,1117,602","19,14,1118","13,974,1119","8,1120","8,1121","13,723,358","13,723,602","13,641,683","13,101,1122","19,607,1123","13,75,1124","17,1125","19,184,1126","13,1090,235","13,1090,235,1098","4,334,89","13,1127,1128","13,220,1129,1098","13,113,684","0,1130,97","13,124,1131","13,1117,1132","19,169,1133","13,991,683","13,113,1134","4,247,1135","18,1136","0,1137,1138","12,1139","19,304,1140","4,1141,1142,330,972","0,1143,97","0,1144,1145","0,1146,72","4,13,1147","4,54,1147","22,916","18,1148","0,1149,138","4,7,1150","12,114,194","25,1151","13,116,1151","25,1152","4,13,558","19,281,1153","8,1154","12,1155","15,1156","13,786,626","13,786,626,1098","13,108,626,1098","4,13,1157","12,88","6,1158,529,987","17,1158,529","4,334,1159","0,1160,138","13,116,1161","0,1161,72","0,1162,1,1163,1164","0,1165,97","10,1166","10,1167","13,116,1168,1098","0,1169,97","4,329,783","13,1161","0,1170","28,182,1171","4,1172","0,1173,1","19,101,1174","4,329,1175","4,13,1175","12,1175","2,413,7,8,1176","0,1177,97","10,1178","6,1179","12,1180","12,1181","12,1182","21,498,1183,1184,1064,357","0,1185,72","10,1186","0,1187,97","0,1188,72","0,1189,72","1,1190","25,1191","28,182,1192","0,1193,97","0,1194,97","25,1195","12,1142,16","4,13,1180","13,116,1196","13,116,1197","0,741,72","1,1198","10,1199,37,1200","0,1201,189","6,1202,1203","12,1204,1205","0,1206,138","0,1206,138,1163,1164","0,1207,138","0,1207,138,1163,1164","0,1208,138","0,1208,138,1163,1164","0,1209,138","0,1209,138,1163,1164","28,182,1210","28,182,1211","1,1212","0,1213,1","0,1214,97","3,1215,8,1216","0,1217,72","0,1218,97","0,1219,1","0,1220,1","10,1221,37,1222","3,1221,8,1223","13,1224,1225,1098","13,169,1226","0,1227,138","22,1228,78,216","0,1229,157","8,1230","15,1231","21,291,1232","0,1233,211","0,828,211","19,1234,77","0,470,1138","18,7,189","0,1235,189","19,116,1236","4,13,1237","0,1238,24","13,57,108","25,581","14,1239,78,216","13,113,1129","5,222","21,468,1240","14,348","13,124,1241","13,116,1242","4,54,1243","1,1244","19,116,1245","4,54,1246","13,1247","8,1248","4,1249","21,1250,1251,1184,1064,357","19,116,1252","13,116,1253","6,95,1254","6,1255","6,1125","4,334,27","4,967","2,1256,7,8,1257","4,334,1258","2,1259,7,1260","2,1259,7,8,1260","0,1261,97","0,1262,97","2,1256,7,8,1263","0,1264,7","13,1265","13,828,1266","4,1141,1267","0,1268,342","0,1269,342","13,439,1270","2,1271,7,8,1272","2,1273,7,8,1274","6,1275","5,44","0,1276,138","0,1277,138","13,1278,428","1,1279","29,1280,1281","1,1282","4,54,1283","13,439,89","0,1284,97","30,1285,8,1286","10,1287","12,1288","0,1289,138","0,1290,1","4,54,1291,330,1066","0,1292,97","12,7,494","17,1293","4,13,212","12,1294","6,1295","12,1296","4,54,382","12,382","4,13,1297","4,7,1298","4,334,1299","6,79","0,1300,97","12,1301","0,1302,138","4,334,619","1,1303,1304","31,1305,7,1306","9,413,1307,8,1308","1,1309","1,1310","32,1311,1312","18,1313","13,84,222","4,7,1314","13,1315,619","13,439,1316","21,291,1317,946","12,1318","5,1319","12,1320","15,1321","15,1322","12,231","4,54,1314","13,116,1323","13,245,28","18,1324","10,1325","13,439,1326","0,1327,1138","19,84,81","4,1328,1329","2,413,7,8,1330","0,1331,138","0,807,1","4,13,804","0,1332,97","9,1333,7,8,1334","19,116,1335","18,238,189,610","13,439,1336","12,1297","13,439,653","0,1337,1","1,1338","4,334,77","18,1339","4,54,84","4,54,1340,330,1341","4,54,1342","0,1343,157","12,1344","0,1345,138","13,117,14","13,113,486","0,1346,138","8,1347","13,123,1348","8,1349","22,1350","14,1351","12,1352","5,1352","0,1353,211","12,428,66","4,13,1354","12,1355","12,522","12,1356,24","13,123,22","13,102,1357","25,44","12,117","4,130,1358","13,304,391","13,57,1359","13,407,184","12,532","12,53","4,334,1360","13,108,1361","0,1362,342","0,1363,97","13,974,1364","0,1365,189","0,1366,138","0,1367,138","13,116,109","0,1368,211","13,57,1369","8,1370","0,1371,138","0,1372,138","12,528","8,1359","8,1373","8,1374","8,1375","13,430,607","0,1376,24","0,1377,138","12,1378","12,1379","13,57,864","25,486","12,1380","13,57,1381","19,57,1118","0,1382,211","13,170,124","19,1383,1384","19,116,1385","4,13,182","25,1386","13,57,1387","13,245,1388","13,57,1389","0,1390,72","0,1391,72","6,396","15,1392","18,1393","12,1394","13,81,27","13,123,1395","13,480,1396","0,1397,228","12,830,66","8,1398","4,7,1399","0,1400,1","0,1401,72","22,348,78","12,807","13,73,27","4,13,674","8,1395","13,57,1402","13,184,1403","0,1404,138","4,7,1405","8,1406","0,1407,342","0,1408,97","0,1409,189","0,1410,342","0,1411,342","0,1412,189","1,1413","0,1414,72","13,84,1415","8,1416","4,334,222","25,328","0,1417,97","0,1418,1","12,1323,494","0,1419,72","5,366","0,564,138","17,1420","15,1421","12,1422","8,1423","12,1424","12,1425","12,1426","13,81,1427","0,1428,228","22,1429","15,1430","0,276,24","13,57,1431","19,75,532","0,1432,72","12,1433","0,101,72","8,1434","13,81,1435","0,1436,7","8,561","12,1329","12,1437","8,1438","8,1439","8,655","13,75,885","4,7,1440","12,443","12,1441,494","12,1442,16","12,1443,66","8,767","19,607,1444","1,1445","12,1323","4,329","21,306,1446","12,1447","12,1448,66","4,13,1449","12,1450","21,128,1451,946","0,1452,72","12,1453","8,1454","13,90","14,1455,1456","18,1457","0,1458,72","4,334,1459","21,1460,1461","8,1462","12,1463","13,633,1464","1,1465","4,54,1091","22,1466,66,216","0,1467,7","1,1468","1,1469","31,1470,7,1306","31,1471,7,1306","1,1472","9,1473,7,8,1474","0,1475,72","0,1476,97","12,1477","8,1478","22,7,7,1479","14,7,1480,24","5,1323","4,334,815","21,306,1481,946","12,1482,21","13,1483","4,334,1484","13,123,1066","4,7,1485","8,1486","21,128,1487","18,1488,189","13,235,1489","8,1490","4,1491","8,1492","8,43","0,1493,138","0,1494,72","0,1495,97","12,1496","13,1497","13,57,1498","15,1230","25,89","4,418,102","12,1499,319","0,1500,97","0,1501,97","15,1299","8,1502","13,1503,1504","8,1505","8,1278","8,1506","13,108,1507","0,1508,1","13,407,1509","13,1510","15,163","12,1511","17,1512","0,1513,138","0,1514,138","19,84,425","0,27,24","8,1515","5,1516,66","15,1517","4,54,1518","13,1519","0,1520,138","0,1521,138","13,117,413","13,304,1522","14,1523,1524","0,1525,72","8,1526","15,1527","4,1328","4,7,1528","19,607,7","0,691,97","13,81,991","5,123,21","19,117,626","1,1529","13,116,1530","0,1531,7","0,1532,24","4,54,839","12,991","19,358,1533","13,75,252","6,1534","13,123,425","4,13,508","13,117,816","12,1535","6,1536","4,334,1537","0,1538,72","0,1539,1","0,1540,1","13,184,1541","19,594,127","8,241","13,57,1352","1,1542","6,1543,7,1544","19,456,1545","21,1546,1547","13,116,1396","4,1548,1549","22,1550","4,431,592","4,431,1551","13,102,383","0,1552,97","0,1553,72","13,117,515","32,1554,1555","1,1556,1557","31,1558,7,1559","6,1560","13,108,88","12,1561","19,170,7","8,1562","12,1563","8,461","19,170,1564","8,1565","22,77","19,511,81","4,334,383","12,1566","22,1567","13,102,235","8,516","8,1568","15,1569","0,1570,72","0,1571,189","0,1572,7","17,1573","6,1573","12,7,333","8,1231","13,439,815","13,339,1574","4,690,1","13,1575","22,1576","8,1577","4,1578,1579","21,306,1580","14,1581","13,991,1582","13,123,1583","17,1584","13,439,22","22,1585","22,1586","21,947,1587","13,57,218","4,690,212","4,54,1588","14,1589,333","13,991,1590","8,1591","21,703,1592,1593","17,95,529","3,1594,8,1595","2,1596,7,8,1595","1,1597","22,1598","5,1599","22,1600","13,116,1601","0,837,72","12,1602","22,1603","6,1604","31,1605,7,1306","13,123,1606","6,1607","8,358","22,1429,1608,1609","1,1610","8,1611","13,170,119","0,291,72","0,1612,72","13,116,1613","19,75,88","12,1614","6,1615","0,1409,1616","0,1617,1","12,585","13,116,1618","19,116,1619","13,87,252","0,1620,24","4,418,1621","12,1622","4,54,911","2,1623,7,8,1624","22,1625","22,647,78","12,1626","19,456","12,749","4,13,521","4,690,1627","8,1628","8,165","22,1629","13,57,22","18,1630","6,1631","21,1632,1633,946","33,95,1634","0,1635,342","0,1636,72","12,1637","5,1638","6,1639","13,123,1640","19,1641,1642","13,439,1643","12,1644,194","0,1645,138","14,77,538","14,428,953","19,75,7","0,1646,138","19,607,1533","22,1647","19,57,127","8,1648","17,1649","12,1650","0,1586,24","19,75,395","19,84,413","19,607,127","0,1651,157","8,1569","0,1652,189","13,116,27","13,113,88","19,1653,1654","13,1655","19,1656,14","18,1657","14,1658,1456","19,87,395","14,1511,78","0,1659,72","12,1660,261","19,991,127","21,128,1661","17,53","13,786","18,53,24","6,1394","13,123,641","13,123,80","0,1662,72","6,1663","12,1664","13,57,991","13,123,212","17,1665","4,13,1666","8,163","1,1667","1,1668","15,786","4,13,1669","17,1670","13,81,405","13,116,1671","8,1672","19,675,81","8,1673","19,116,498","12,1674","17,1394","13,304,1675","21,306,1676,946","21,1677,1678,946","13,75,1679","17,1680","21,947,423","22,348,7,354","0,1681,1138","21,947,1682","13,57,1683","14,1684,261","4,13,181","13,73,77","8,1685","4,54,1686","0,1687,97","14,1688,78","14,1689,78","0,1690,24","13,1691","13,124","19,991,395","8,1692","13,123,486","4,329,1693","6,1694","17,1695","13,84,1696","14,1697,78","0,1698,72","0,1699,97","12,1700","4,334,1296","4,7,1701","13,245,366","4,690","8,1702","13,1703","13,607,619","13,117,1640","0,1704,138","0,1705,138","4,7,1706","14,1707,538,354","0,1708,97","0,1709,7","4,802,7,330,1710","5,1711","19,75,77","0,1712,342","0,1713,97","22,1714","25,222","13,113,396","12,1715","14,276","13,1716","13,75,108","1,413","32,1717,1718","14,1719,66,216","6,95,529,530","6,1720","12,1721","4,13,1722","21,1723,1724,946","0,1725,72","19,81,1726","6,1727","14,44,126","8,1728","15,1729","1,1730","13,57,1731","8,1732","12,1733","19,116,1734","22,1735","0,1736,138","13,581,1737","13,57,425","12,1738","22,1660","0,413,1","0,634,1","8,1739","13,454,109","13,117,1602","13,116,1740","12,1741","13,108,626","0,151,228","0,1742,1","6,1743","17,1744","0,1745,189","8,1746","8,1747","15,1748","12,1749","0,561,72","13,480,102","4,334,235","18,1750","4,1751,1621","13,439,1752","0,1753,72","12,1754","0,1755,1","0,1756,97","18,1757","5,413","8,1758","13,57,1759","8,1760","14,1761,78","15,1762","8,1763","5,1764","21,128,7,946","15,1765","4,27","0,1766,342","0,1767,342","0,1768,97","8,1769","13,123,269","13,116,1770","22,1771","13,124,1772","12,324,1773","14,982,261","13,108,252","0,1774,97","8,1775","17,1776","4,54,1777","17,963","8,870","6,1778","8,1779","8,14","12,306","19,87,1780","8,1781","8,1782","13,1117,396","8,1783","25,396","13,75,1784","13,170,1785","13,407,664","13,123,558","19,116,1118","8,1786","8,1787","13,57,1788","13,116,52","22,1789","13,1790,310","0,1791,97","13,1792","12,1793","25,425","17,1158","13,57,1035","19,116,1794","12,1795","13,1796,222","8,1797","0,1798,97","6,1799","6,22,1800","13,1801","0,1802,138","0,1803,72","14,1804,194","21,306,1805,946","4,334,292","1,1806","13,1807,741","12,211,357","22,647","15,484","0,1808,157","13,1809","4,54,1810","0,396,1","13,116,486","12,7,16","12,197","14,1142,261","6,1811","0,1714,24","8,1765","15,1416","13,123,1812","0,828,7","0,1813,97","1,1814","2,1472,7,8,1815","2,1816,1817,8,1815","31,1818,7,1819","31,1820,7,1821","13,358,1822","4,54,1823","4,13,222","17,932","17,1824","4,7,75","4,334,1825","0,1826,24","17,1827","8,1828","13,235,1829","12,265","5,1830","13,57,1831","13,116,714","21,306,1832","12,1660","0,1833,24","22,276,78,354","12,1834","12,1835,333","18,1836","13,1746","0,1837,97","0,1838,24","1,1839","19,461","6,1840","21,1841,1842","21,1841,1843","21,1841,1844","21,1841,1845","4,13,184","4,13,111","4,7,532","5,1846","4,7,1846","4,7,1847","0,1848,1","15,1849","19,57,1850","0,1828,1138","0,1851,72","6,1852","1,1853","1,1854","12,1855","0,1856,24","13,1857,396","4,7,772","25,1858","12,428,333","6,1859","0,1860,72","0,507,72","5,815","0,1861,72","12,1862","0,1863,138","13,527","6,1864","0,1865,138","15,1866","12,1867","0,1868,1138","4,54,1869","0,1870,97","0,1871,72","0,1872,138","14,1873,538","15,1874","4,431,509","8,1875","22,476,7,354","17,1876","12,1443","13,1877","8,961","4,334,1878","0,1879,1880","21,291,1881,946","21,306,1882,946","6,1883","6,1884","13,117,772","12,1885","12,54","13,170,607","12,1886","0,1887,97","12,1888","12,1889","18,1890","19,116,1891","4,7,1892","13,57,1893","5,1894","13,57,594","12,52","12,1895","12,1896","13,117,1867","6,1897","0,437,24","0,1898,72","19,439,1654","19,1347,127","19,1114,425","1,1899","1,1900","13,150","12,1901","1,1902","25,1903","13,1416","12,1904","13,116,1905","32,1906,1907","13,723,1563","0,1908,138","0,1909,138","18,1910","22,1911","25,108","0,1912,97","13,235,1913","14,1914,1915,216","12,815,494","0,1916,138","0,1917,97","6,1918","0,585,72","1,1919","6,1920","15,462","4,334,1921","0,1922,1138","4,334,95","0,1923,138","8,1924","25,783","12,809,319","19,1925,1926","0,1927,1","0,1928,1","0,1929,1","8,1930","12,1931","8,1932","19,1933,1934","0,1935,72","0,1936,72","8,1937","22,1938","14,1939,78","22,1940,78","12,1941","13,116,89","0,1942,138","4,13,396","15,1943","15,1944","1,1945","15,1746","13,57,136","12,1946","12,815,1947","8,1948","22,1949,78,216","12,41","19,235,1950","12,1951","0,1952,72","13,116,54","0,1672,72","4,334,1953","0,1954,97","19,73,1955","13,108,991","4,54,1956","18,1957","12,1958","21,128,1959,155","18,1960","21,81,1961","12,252","19,84,1962","8,1963","21,128,1964","4,690,1965","12,1966","0,1967,1138","4,334,1968","12,1969","12,812","12,1970","4,13,783","19,235,480","12,1971","12,1972","0,1973,24","0,1974,97","12,114","13,439,1975","19,1976,1977","8,1978","15,221","0,443,97","15,1979","0,1980,1773","22,77,78,216","13,1981,27","19,1982,1983","4,13,123","5,498","0,482,72","19,594,1984","12,1985","13,113,789","8,1010","12,1986","8,910","15,1987","15,1988","21,306,1989","1,1990","10,1991","0,1992,97","0,1993,72","22,348,66,216","0,1994,1","0,1995,1","0,1996,1","14,1319,78","17,1997","0,1998,189","0,1999,189","12,2000","13,245,57","12,212","19,116,425","21,128,2001","0,2002,24","15,2003","18,2004,189","4,334,2005","0,2006,24","12,2007","12,2008","24,2009","12,1874","0,2010,72","12,2011","0,2012,97","12,2013,2014","0,2015,342","0,2016,342","6,2017","4,54,2018","12,2019","12,151","0,2020,357","8,2021","8,850","0,2022,2023","12,2024","12,2025","0,2026,72","17,2027","15,348","13,73,222","13,123,2028","15,2029","5,2030","0,2031,72","0,2032,342","34,2033,681,2034","34,2035,681,2034","1,2036","2,2036,7,8,2037","6,2038","2,1811,7,8,2039","35","0,2040,138","0,2041,138","0,2042,138","2,2043,7,8,1815","9,2043,7,8,1815","31,2044,7,1819","12,1511,319","4,54,2045","5,2046","19,102,2047","19,87,57","25,2048","6,2049","4,334,1499","24,53","0,1018,211","1,2050","17,2051","32,2052,2053","0,2054,1880","0,2055,72","13,117,2056","4,13,2057","0,2058,2059","4,54,2060","1,2061","8,2062","0,2063,72","4,247,2064","13,102,2065","13,439,486","19,116,212","14,2066,78","22,2067,78","0,2068,138","21,128,2069,946","4,54,2070","6,2071","0,2072,72","4,13,1142","0,1692,72","12,2073","4,13,281","13,116,2074","21,128,2075","15,2076","25,111","15,1777","0,2077,138","0,2078,138","1,2079","2,2079,7,8,2080","4,646","0,2081,72","12,1354","0,2082,138","0,513,7","22,44,66,216","13,999","14,2083","12,2084","12,2085","12,2086","12,2087","31,2088,2089,1306","1,2090,2091","8,2092","13,2093","2,2094","1,2094","5,515","13,113,991","0,2095,342","22,2096","6,2097","2,2098,7,8,2099","31,2100,7,2101","1,2102","0,2103,228","13,124,2104","8,2105","13,57,396","13,339,655","13,2106","12,2107","21,291,2108,946","21,306,2109,946","19,81,2110","0,2111,97","0,2112,157","0,2113,24","0,2114,24","0,2115,189","0,2116,7","12,2117","19,84,2118","8,2119","4,13,1884","6,2120,2121","17,2122","0,2123,1","24,2124","13,116,220","17,1840,2125","4,54,2126","9,2127,7,8,2128","9,2129,7,8,2130","9,2131,7,8,2132","9,2133,7,8,2134","9,2135,7,8,2136","0,2137,1880","12,391","0,1963,138","15,1692","0,2138,72","13,102,2139","15,2140","0,2141,24","13,113,2142","6,360,529,530","13,991,222","12,2143","6,2144,529,987","4,334,2145","13,989","13,57,2146","14,2023,78,216","17,2147","15,2148","6,2149","0,2150,72","0,2151,138","31,2152,7,1306","12,2153","15,1018","13,439,2154","22,1523","12,1040","14,2155,66,216","15,767","22,7,66,216","14,276,78,216","13,57,2156","4,13,413","17,360,529","5,2157","13,220,1135","0,2158,138","4,54,2159","12,2160","14,2161,953","6,2162","21,306,2163,946","18,2164","5,2165","6,2166","12,7,2167","12,2168","2,2169,7,8,2170","13,124,2171","4,54,1142,330,2172","13,116,2173","29,2174,2175","29,2174,2176","29,2174,2177","17,2178","6,2178","14,383,78","12,373,24","8,2179","12,596","13,358,683","0,2180,97","13,57,2085","0,2181,97","17,2182","4,247,594","17,2183","6,2183","17,2184","1,2185","1,2186","12,2187","22,2188","6,2189,529,987","0,1015,72","6,2190","0,2191,72","0,1022,97","0,2192,97","0,2193,24","0,2194,97","0,2195,72","6,2196","1,78,2197","6,2198","31,2199,7,2200","0,143,72","0,2201,1138","13,57,128","0,2202,72","4,54,428","13,57,2203","2,2079,7,8,2204","0,2205,1","0,2206,24","1,2207,17","0,2208,2209","19,117,2210","12,2211","12,2212","8,2213","0,2214,97","0,2215,189","0,2216,138","13,57,646","36","4,7,1329","19,439,783","13,1114,222","13,480,77","13,358,2217","25,2218","12,2219","8,2220","17,22,529","22,2221,66","14,276,78","12,804,194","1,2222","0,2223,72","22,1523,78,354","22,276,78","13,57,2224","13,124,498","13,761,2225","19,991,2226","0,1374,72","12,2227","4,54,2228","8,1500","12,836","0,2229,1138","4,13,2230","22,2231,2014,216","12,1359","13,117,2232","0,2233,97","25,109","1,2234","12,2235","19,407,395","0,2236,97","17,2237","0,2238,72","13,123,1903,2239","13,439,2240","12,2241","0,2242,228","15,2243","0,2244,24","18,2245","4,54,594","12,2246","8,2247","0,2248,189","1,2249","0,2250,97","6,95,7,530","6,1997","14,1523,66,216","13,117,2251","1,2252","1,2253","1,2254","13,761,2255","6,2256","12,2257","12,2258","12,2259,319","12,2260","4,334,2261","4,329,2262","1,2263","1,2264","1,2265","2,2266,7,8,2267","13,116,683","14,647","2,2268,7,8,2269","2,2270,7,8,2271","0,2272,72","0,2273,24","0,2274,2275","13,761,2276","0,2277,72","4,13,2278","0,2279,2280","12,2281","12,2282","6,2283","2,2284,7,8,2285","12,1953","12,2286","19,123,2287","0,2288,7","17,2289","22,2290,7,216","0,2291,1","0,860,1","2,2292,7,8,2293","6,2294","18,2295","13,1510,2296","13,113,1499","13,1117,2297","12,1499","12,185","0,2298,138","0,2299,24","12,2300","13,2301,222","4,54,2302,330,2303","32,2304,2053","0,2305,1","6,2306","15,1015","2,2307,7,8,2308","0,634","2,2309,7,8,2310","4,54,2311","13,123,2312","18,2313","12,116","21,128,2314,155","21,128,2315,155","21,128,2316,155","4,54,580","4,334,2317","13,439,2318","8,1686","1,2319","8,2320","13,123,2321","6,2322","0,2323,1","4,13,2324","0,2325,138","37,2326","0,2327,1","12,2328","0,2329,2330","28,2331","18,2332","0,2333","1,2334","25,2335","1,2336","13,633,2337","6,2338","0,2339,984","5,197","18,2340","14,7,21,216","18,2341","13,84,2342","0,2343,138","21,128,2344","4,334,816","12,2345","0,43,138","5,41","4,54,2346","8,2347","13,170,2348","18,1033,357,610","1,2349","1,2350","0,2351,97","4,54,2352","6,2353","19,116,2354","18,2355","13,1089,2356","5,684","19,116,2357","0,2358,342","19,123,127","0,2359,189","0,2360,189","6,2361","0,2362,342","8,2363","0,2364,72","13,84,123","4,334,136","18,2365","4,54,2366","18,2367","4,334,1612","1,2368","4,334,543","13,439,396","4,54,2369","13,439,428","2,2370,7,8,2371","2,2372,7,8,2373","6,2374","12,2375","0,2376,72","13,81,594","0,540,72","4,54,2377","12,2378","31,2379,7,2380","0,2381,1","12,1693","13,2382","12,2383","15,2384","17,2385","8,2386","33,2387,1125","33,2388,2389","33,2390,2391","33,2392,2393","12,2394","17,2395","15,2396","6,1158","12,2397","4,54,89","19,1089,2398","8,1299","8,2342","6,950,529","1,2399","1,2400","13,123,89","6,2401","13,439,112","0,2402,138","21,128,2403","32,2404,2053","17,2052","1,2405","2,2406,7,8,2407","8,2408","33,2409,2410","33,2411,2412","33,2413,2414","2,2415,7,8,2416","2,78,2417,8,2418","2,2419,7,8,2420","12,681,194","0,2421,72","22,2422","14,2423,2424","12,2425","13,57,2426","0,2427,97","21,2428,2429,946","14,7,7,24","0,2430,342","0,2431,72","0,2432,72","13,2433","0,2434,72","0,2435,72","0,2436,228","2,2437,2438,8,2439","2,2437,2440,8,2439","2,2441,7,8,2439","1,2441","1,2437,2438","1,2437,2440","31,2442,2443,1306","4,2444,413","1,2445","13,607,119","4,54,2446","0,2447,138","0,2448,211","0,2449,138","0,2450,342","8,2451","15,2452","14,2453,78","12,2454,494","0,2455,138","4,2456,77","0,2457,72","15,2458","15,2459","1,2460","31,2461,2462,1306","31,2463,2464,1306","31,2465,7,1306","0,2466,189","0,767,189","13,116,2467","15,2468","12,222,194","0,2469,1","13,116,2470","1,2471","9,2472,7,8,2473","0,2474,342","13,123,27","17,2475","1,2476","0,1429,24","0,2477,72","0,2478,97","13,789,2479","13,116,493","21,128,1964,946","21,128,2480,946","13,57,2481","17,2482,529","0,532,72","4,418,52","6,2483","13,991,27","0,2484,7","13,116,2485","18,238,189","0,350,72","6,2486","0,2487,1138","13,439,594","4,334,2488","13,116,737","0,2489,342","0,2490,72","0,2491,72","0,140,1","13,761,425","13,57,2492","12,2493","13,73,1874","12,7,2494","12,2495","5,2495","24,2496","4,329,2497","0,2498,342","12,816","25,1606","5,1674","25,1674","0,2499,72","13,684","12,235,2500","0,2501,72","19,761,2502","4,334,212","6,360,529,987","14,1719,7,354","13,116,2503","0,2504,97","19,116,2505","25,1296","0,2506,72","34,2507,1660,674","19,116,81","19,184,2508","1,2509","12,2510","19,2511,2512","18,238,2513","13,124,2514","18,2515","6,95,2516","0,2517,97","0,2518,97","13,57,2519","0,2520,72","13,84,89","0,2521,72","4,334,723","12,1073","12,1499,494","13,974,52","12,2522","1,78,2523","1,78,2524","4,329,646","6,2525","13,116,2526","12,111","19,235,2527","6,2528","0,1867,157","4,334,123","12,2529","12,7,21","22,2530,66,2531","0,2532,97","12,2533","4,54,2534","18,2535","0,2536,24","2,78,2537,8,2538","4,334,2539","4,54,2540","0,2541,138","18,2542","8,2543","8,2544","8,2545","8,2546","8,1511","8,2547","0,2191,1","8,616","8,2548","13,439,2549","21,128,2550,155","18,2551","12,2552","18,2553,189","6,2554","0,2555,97","13,480,2556","4,334,482","19,170,2557","13,281,594","4,690,1037","12,1037","4,334,2558","4,334,2559","12,2559","0,465,138","4,334,653","0,2560,1","0,2561,1138","12,2562","2,2563,7,8,2564","17,2565","0,2566,138","0,2567,138","0,2568,342","0,2569,342","25,95","8,2570","6,2571","12,95","4,13,136","28,2572,2573","17,2574","4,13,2575","14,2576,78","22,2577,66,216","4,54,2578","13,439,222","1,2579","12,2580","4,2581,382","5,2582","12,2583","15,2584","12,2585","0,2586","18,2587","18,2588","4,334,2589","25,646","12,2590","6,2591","17,2591","2,1811,7,8,2592","9,1811,7,8,2592","1,2118,2593","4,334,581","1,2594","6,2595","0,2596,97","0,2597,72","0,2598,97","31,2599,7,2600","0,2601,138","9,2602,7,8,2603","4,54,310","13,443","0,2604,138","0,2605","0,2606","12,2607","4,334,2608","0,2609,72","4,54,306","13,974,498","12,2610","13,439,2611","4,1328,77","4,565,1511","12,2612","18,2613","12,2614","13,84,804","4,54,2615","12,79","12,2616","13,113,2617","13,439,2617","12,1966,66","18,2618","25,558","4,13,2619","12,2620","0,2621,24","13,281,2622","18,2623","18,2624","25,2625","6,2626","6,2627","18,2628","13,581,89","0,2629,1138","6,2630","12,2631","12,2632","10,2633","10,2634","3,2634,8,2635","12,2636","0,2637,97","0,2638,138","0,2639,138","0,749,138","0,2640,138","0,2641,97","5,2642","8,2643","0,2644,7","4,690,2645","0,2646,1","0,1161,1","8,1762","4,7,2647","8,2457","0,2648,138","0,2649,138","0,413,211","18,2650","0,682,138","13,57,2651","0,2652,138","12,2653","18,413","0,2654,189","4,54,2655","0,2656,342","1,2657","2,2658,7,8,39","19,170,2659","2,413,7,8,1308","14,2660,78,216","1,2661","18,2662","0,2663,72","30,2664,8,2665","17,2666,529","4,329,2667","12,2668","0,684,157","4,54,2669","12,7,2670","19,723,2671","19,2672,2671","0,2673,72","0,2674,72","6,2675","17,2675","4,54,2676","12,2677","4,54,456","5,89","5,2678","12,2678","3,2679,8,2680","21,498,2681,946","5,2682","13,974,89","0,2683,1","0,2684,1","4,7,2685","5,2686","19,116,2687","12,2688","0,2689,138","0,2690,138","0,2691","1,2692","25,112","22,1598,78","13,485,2693","17,2694","17,2695","12,2696","18,2697","4,54,2698","2,2699,7,8,2700","4,334,2701","0,2702,1","0,2703,97","0,2704,138","9,2705,7,8,39","0,2706,1","0,2707,72","5,804","4,54,2708","8,2709","18,2710","13,169,252","12,2678,194","5,2678,333","4,13,2711","6,1584","14,2712,261,216","17,2713","15,2714","0,2715,72","14,2716,78,354","0,2717,138","0,2718,24","22,2719,66,216","13,84,2720","14,2721,78","9,2722,7,8,2723","2,2724,7,8,2725","13,439,2726","17,95,2727","13,84,2728","12,2729","4,334,2730","12,2731","4,2732","2,2733,7,8,2734","4,329,2735","19,2736,2737","19,2738,2737","6,2739","12,2740","12,2741","5,2742","4,968,2743","12,1795,66","0,2744,72","6,2745","4,54,235,2746,189","21,498,182,1184,1064,66","0,2747,97","9,2748,7,8,2749","2,2750,7,8,39","0,2751,97","12,2752","12,741","12,2753","0,2754,97","0,2755,7","24,2756","1,2757","6,2758","4,13,878","10,2759","2,2760,7,8,2761","8,2762","3,2763,8,2764","12,2765","4,334,2766","12,2767","4,2768,2769","0,1018,72","10,2770","6,2771","34,2772,681,2034,2773,2774","38,2775,2776","12,2777","4,7,2778","12,2779","6,2780","30,2781,8,2782","33,2783,2784","0,1219,72","4,7,2785","6,2786","4,329,2787","12,2788","0,2789,138","12,7,538","0,2790,1","0,2791,1","0,2792,72","9,2793,7,8,2564","6,2794","33,1158,2795","12,2796","6,377,2797","1,2798","4,13,2799","4,2800,2801","18,2802","0,2803,72","6,2804","0,2805,72","0,22,342","0,2806,342","12,2807","4,334,2808","4,2809,2810","4,2811,2812","13,991,77,1098","13,116,2813","13,2814,2815","13,235,2816","19,2620,2817","25,2818","13,235,2819","13,2820,2821","19,184,2822","13,52,2823","19,1857,2824","25,77","1,2825","1,2826","17,2827","0,2828,72","13,116,2829","8,2830","15,2831","19,169,676","6,2832","0,2833,1","0,2806,1","25,2834","0,2835,138","17,2836","8,1807","17,2837","17,2838","0,2839,72","1,2840","4,7,2841","0,2842,72","4,7,125","17,2843","17,2844","0,2845,7","1,2846","0,2847,157","24,2848","0,2849,342","0,2850,342","17,2851","0,2852,342","17,2853","6,2854","0,2855,72","0,2856,72","19,2857,84","6,2858","21,2859,2860,946","17,2861","17,2862","17,2863","21,128,2864,155","0,2865,72","6,2866","39,2867,8,2868","15,2869","0,2118,97","6,2870","0,2871,342","6,2872","17,2873","17,2874","17,2875","17,2876","40,2877","17,2878","6,2879","17,2880","6,2881","39,2882,8,39","0,2883,157","0,2884,72","0,2885,72","0,2886,72","0,2887,72","0,2888,72","0,2889,72","8,1090","8,2890","15,2891","5,2892","19,2893,2894","17,2895","6,2896","6,2897","6,2898","6,2899","17,2900","17,2901","17,2902","0,2903,72","6,2904","6,2905","17,2906","6,2907","6,2908","6,2909","17,2910","6,2911","17,2912","5,991","5,2496","17,2913","12,2914","6,2915","17,2916","6,2916","17,2917","5,2918","14,1142,2919,216","2,2920,7,8,2921","2,2922,7,8,2473","2,2923,7,8,2924","9,2920,7,8,2925","1,2926","9,2927,7,8,39","10,2928,37,38","1,2929","10,2930,37,38","11,2931,8,39","11,2932,8,39","11,2933,8,39","17,2934","17,2935,2797","12,2936,16","12,2937","12,2938","12,2939,2940","12,2941","13,607,2942","0,151,1","12,2943,1205","17,2944","0,2945,138","0,2946,138","0,2947,1138","8,2948","8,2949","12,2950","13,116,2951","12,2952","17,2953","21,2954,2955,946","6,2956,7,7,2957,2958","8,2959","12,7,2960","5,2961","12,2961","6,2962,2963","6,2964,2965","6,2966,529,530","12,2967","6,2968,2969","4,13,2970","0,2971,228","0,2972,228","0,2973,228","0,2974,228","19,281,2975","0,1562,72","21,291,2976,1184,1064,66","0,2977,1","0,2978,1","19,2979,2829","19,2980,2981","12,2982","6,2983","8,2984","9,2985,7,8,2986","0,2987,72","8,2988","14,2989","0,2990,72","0,2991,72","0,2992,157","14,2993,16","0,2994,157","0,1867,72","21,2995,2996","0,2997,211","1,2998","0,2999,72","0,3000,342","0,3001,72","17,3002","0,3003,157","0,3004,72","0,3005,72","0,3006,72","0,3007,72","0,3008,72","0,3009,342","0,3010,72","0,3011,72","6,3012","5,581","6,3013","14,3014,78","21,3015,3016","21,3017,3018,946","13,3019","0,3020,7","17,3021","19,3022,3023","6,3024","0,3025,342","22,3026,7,354","17,3027","0,3028,342","17,3029","0,3030,72","17,3024","0,3031,72","0,3032,97","0,3033,342","0,1663,342","14,592,538,216","14,1076,261,216","0,3034,1138","0,3035,72","17,3036","0,3037,72","0,3038,72","0,3039,72","0,631,342","0,3040,72","17,3041","8,3042","0,3043,72","0,3044,72","0,3045,72","0,3046,342","0,3047,97","13,116,602","0,3048,342","0,3049,72","0,3050,342","0,3051,72","0,3052,7","8,3053","0,3054,342","0,3055,72","0,3056,342","0,3057,72","0,3058,342","0,3059,72","0,3060,72","0,3061,342","0,3062,342","0,3063,342","0,3064,342","0,3065,342","0,3066,342","0,3067,72","0,3068,72","14,3069,261","0,3070,342","17,3071","22,753,78","41","0,3072,342","0,3073,72","4,54,3074","0,3075,342","0,3076,72","0,3077,72","0,3078,72","14,3079,333","14,413,78","0,3080,342","0,3081,72","0,3082,342","0,3083,72","0,3084,1","0,3085,97","0,3086,342","0,3087,72","0,3088,342","0,3089,1138","0,3090,342","0,3091,72","0,3092,72","0,3093,72","0,3094,342","0,3095,72","0,3096,72","0,3097,342","0,3098,1138","0,3099,342","0,3100,72","0,3101,72","0,3102,72","0,3103,72","0,3104,342","0,3105,72","14,3106,261,216","0,3107,342","0,3108,7","0,3109,342","0,3110,72","0,3111,72","17,3112","0,3113,342","0,3114,72","0,3115,342","0,3116,72","0,3117,72","0,3118,342","0,3119,72","0,3120,72","0,3121,72","0,3122,72","0,3123,72","0,3124,342","0,3125,72","14,3126,78,216","14,3127,261,216","0,3128,72","6,3021","14,3129,78,216","0,3130,342","0,3131,72","6,3132","14,3014,3133,216","14,3014,3134,216","0,3135,72","12,3136","0,1522,342","0,3137,72","0,3138,342","17,3139","0,2301,72","0,3140,342","0,3141,72","0,3142,342","0,3143,72","0,3144,342","0,3145,72","0,3146,342","0,3147,72","0,3148,72","0,3149,138","14,1142,333,216","14,3150,533,216","0,3151,342","0,3152,72","0,3153,72","14,850,78,216","17,3154","0,3155,342","0,3156,342","0,3157,72","0,3158,72","0,3159,342","0,3160,72","0,3161,72","0,3162,138","0,3163,72","0,3164,72","0,3165,342","0,3166,72","0,3167,72","0,3168,1","0,3169,72","0,3170,72","0,3171,72","0,3172,72","4,54,7,330,3173","0,3174,342","0,3175,72","0,3176,342","0,3177,72","0,3178,342","0,3179,72","0,3180,342","0,3181,72","0,3182,72","0,3183,97","0,3184,138","0,3185,72","0,3186,157","0,3187,189","0,3188,72","0,3189,342","0,3190,342","0,3191,72","0,3192,342","0,3193,72","4,13,3194,330,3195","0,3196,342","0,3197,342","0,3198,72","0,3199,72","0,3200,72","0,3201,342","0,3202,72","0,3203,72","0,3204,72","0,3205,72","0,3206,72","6,3207","0,3208,342","0,3209,72","0,3210,72","0,3211,342","0,3212,72","0,3213,1","0,3214,1","4,418,3215","12,3216","4,334,1359","8,3217","0,3218,72","12,3219","19,1562,3220","19,73,3221","13,789,3221","12,3222","4,334,532","12,3223","34,2631,1660,674","13,974,2696","13,123,151","19,527,2813","0,3224,7","0,3225,97","12,3226","15,521","4,3227,3228","8,413","0,3229,72","6,3230","12,3231","17,3232","8,3233","12,3234","13,150,3235","13,102,3236","6,3237","13,73,2696","12,3238","0,3239,72","0,3240,72","12,3241","12,3242","12,3243","12,3244","0,3245,97","4,329,3246","0,3247,342","5,3248","0,3249,1","4,334,769","0,222,24","13,527,3250","13,117,3251","13,3252,3251","12,3253","12,3254","6,3255","0,3256,72","13,123,3257","0,3258,97","13,84,3259","12,415","25,3260","0,22,72","13,57,3261","12,3262","5,3262","13,123,3263","4,7,3264","0,3265,97","0,3266,97","12,3267","0,413,7","13,57,3268","8,3269","0,3270,97","15,3271","0,81,211","0,3272,138","12,3273","0,3274,7","25,240","0,3275,342","0,3276,72","0,3277,72","15,3278","13,124,77","0,3279,72","0,3280,342","19,3281,3282","8,3283","15,3284","13,117,3285","0,3286,1","0,3287,72","13,57,3288","13,124,3289","0,3290,72","4,334,116","14,3291,7,354","22,3292,7,354","0,3293,24","0,3294,1","18,3295","14,3296,78,354","13,124,3297","0,3298,97","1,2699,3299","1,78,3300","1,3301","0,3302,342","0,3303,342","18,24,3304","8,3305","8,3306","13,124,3307","0,3308,72","13,124,3309","13,3310","14,3311,7,354","0,3312,1","22,3313,7,354","18,3314","0,3315,138","1,3316","0,3317,72","12,3318","19,116,3319","13,116,3320","0,3321,342","13,594,3322","0,3323,72","4,334,3324","13,2620,3325","13,124,3326","8,3327","13,170,3297","1,3328","13,116,3329","0,3330,72","8,3331","19,1913,3332","8,3333","13,57,3334","13,57,3335","28,2572,3336","13,304,3336","12,3337","13,3252","14,3338,261,216","4,334,594","13,124,3339","0,3340,189","12,3341","13,124,3342","4,3343,1511","18,3344","22,3345,66,354","0,3346,1138","0,3347,1138","0,3348,1138","0,3349,1138","0,3350,1138","21,3351,3352","12,3353,66","12,3353,274","13,1117,428","13,607,3353","13,116,3354","25,2820","13,57,3355","0,3356,342","0,3357,97","0,3358,97","15,3359","15,3360","12,3361","0,3362,1138","1,3363","1,3364","0,3365,1138","12,3366","0,3367,72","4,3343,3368","19,116,3369","1,3370","21,291,3371","0,3372,7","0,3373,7","1,1394","1,3374","0,3375,7","0,3376,7","0,3377,7","0,3378,7","0,3379,7","0,3380,7","0,3381,138","42,3382","13,2620,3383"];
    const args = /* 3384 */ ["ytInitialPlayerResponse.playerAds","undefined","ytInitialPlayerResponse.adPlacements","ytInitialPlayerResponse.adSlots","playerResponse.adPlacements","playerResponse.adPlacements playerResponse.playerAds playerResponse.adSlots adPlacements playerAds adSlots important","reelWatchSequenceResponse.entries.[-].command.reelWatchEndpoint.adClientParams.isAd entries.[-].command.reelWatchEndpoint.adClientParams.isAd","","propsToMatch","url:/reel_watch_sequence?","entries.[-].command.reelWatchEndpoint.adClientParams.isAd","..itemSectionRenderer.contents.*[?.adSlotRenderer]","/get_watch","load","Object","fireEvent","500","enabled","force_disabled","hard_block","header_menu_abvs","10000","adsbygoogle","nsShowMaxCount","0","toiads","objVc.interstitial_web","adb","navigator.userAgent","require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.serpResponse.results.edges.[-].relay_rendering_strategy.view_model.story.sponsored_data.ad_id","require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.node","require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.node.story.sponsored_data.ad_id","require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.marketplace_search.feed_units.edges.[-].node.story.sponsored_data.ad_id","require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.viewer.marketplace_feed_stories.edges.[-].node.story.sponsored_data.ad_id","data.viewer.instream_video_ads data.scrubber","/api/graphql","..node[?.__typename==\"MarketplaceFeedAdStory\"]","matches","/^.{1000,}/","/graphql","__eiPb","detector","showAds","adBlockerDetected","show","SmartAdServerASMI","CLIENT_STORE_INITIAL_STATE.pageAggregation.advertisement.adBlockWallEnabled","CLIENT_STORE_INITIAL_STATE.pageAggregation.advertisement.adsOn","_sp_._networkListenerData","SZAdBlockDetection","_sp_.config","AntiAd.check","open","/^/","click","showNotice","_sp_","$","_sp_.mms.startMsg","retrievalService","admrlWpJsonP","yafaIt","LieDetector","ClickHandler","IsAdblockRequest","InfMediafireMobileFunc","1000","newcontent","ExoLoader.serve","Fingerprint2","request=adb","AdController","noopFunc","document.querySelector","popupBlocked","Math","/\\}\\s*\\(.*?\\b(self|this|window)\\b.*?\\)/","_0x","*","doubleclick","stop","onload","ga.length","adblock_added","setTimeout","admc","exoNoExternalUI38djdkjDDJsio96","String.prototype.charCodeAt","ai_","window.open","adcashMacros","SBMGlobal.run.pcCallback","SBMGlobal.run.gramCallback","(!o)","(!i)","googlesyndication","Object.prototype.hideAds","true","Object.prototype._getSalesHouseConfigurations","player-feedback","samInitDetection","decodeURI","decodeURIComponent","Date.prototype.toUTCString","Adcash","lobster","openLity","ad_abblock_ad","String.fromCharCode","shift","PopAds","AdBlocker","Adblock","addEventListener","displayMessage","runAdblock","document.createElement","jQuery","TestAdBlock","ExoLoader","loadTool","cticodes","imgadbpops","document.getElementById","document.write","redirect","4000","inlineScript","onclick","RunAds","/^(?:click|mousedown)$/","bypassEventsInProxies","jQuery.adblock","test-block","adi","ads_block","blockAdBlock","blurred","false","exoOpts","doOpen","prPuShown","flashvars.adv_pre_src","showPopunder","IS_ADBLOCK","page_params.holiday_promo","__NA","ads_priv","ab_detected","adsEnabled","document.dispatchEvent","adBlockDetected","t4PP","href|target","a[href=\"https://imgprime.com/view.php\"][target=\"_blank\"]","complete","String.prototype.charAt","trueFunc","sc_adv_out","mz","ad_blocker","AaDetector","_abb","puShown","/doOpen|popundr/","pURL","readyState","serve","stop()","btoa","Math.floor","AdBlockDetectorWorkaround","apstagLOADED","jQuery.hello","/Adb|moneyDetect/","isShowingAd","VikiPlayer.prototype.pingAbFactor","player.options.disableAds","__htapop","exopop","/^(?:load|click)$/","popMagic","script","atOptions","XMLHttpRequest","console.clear","flashvars.adv_pre_vast","flashvars.adv_pre_vast_alt","x_width","1","getexoloader","disableDeveloper","oms.ads_detect","Blocco","2000","_site_ads_ns","hasAdBlock","pop","ltvModal","luxuretv.config","popns","pushiserve","creativeLoaded-","exoframe","/^load[A-Za-z]{12,}/","rollexzone","tick","registerLazyExo","ALoader","Object.prototype.AdOverlay","tkn_popunder","null","detect","dlw","40000","ctt()","0.001","can_run_ads","test","adsBlockerDetector","globalThis","NREUM","adblock","pop3","__ads","ready","popzone","FlixPop.isPopGloballyEnabled","falseFunc","/exo","ads.pop_url","checkAdblockUser","checkPub","6000","tabUnder","atob","check_adblock","l.parentNode.insertBefore(s","_blank","ExoLoader.addZone","encodeURIComponent","isAdBlockActive","raConf","__ADX_URL_U","tabunder","RegExp","POSTBACK_PIXEL","mousedown","preventDefault","'0x","Aloader","advobj","replace","popTimes","addElementToBody","phantomPopunders","$.magnificPopup.open","adsenseadBlock","stagedPopUnder","seconds","clearInterval","5000","CustomEvent","exoJsPop101","popjs.init","-0x","closeMyAd","smrtSP","adblockSuspected","nextFunction","250","xRds","cRAds","myTimer","1500","advertising","countdown","tiPopAction","rmVideoPlay","r3H4","disasterpingu","document.querySelectorAll","AdservingModule","ab1","ab2","hidekeep","pp12","__Y","App.views.adsView.adblock","document.createEvent","ShowAdbblock","style","clientHeight","flashvars.adv_pause_html","/^(?:click|mousedown|mousemove|touchstart|touchend|touchmove)$/","system.popunder","BOOTLOADER_LOADED","PerformanceLongTaskTiming","proxyLocation","Int32Array","$.fx.off","popMagic.init","/DOMContentLoaded|load/","y.readyState","document.getElementsByTagName","smrtSB","href","#opfk","byepopup","awm","location","adBlockEnabled","getCookie","history.go","dataPopUnder","/error|canplay/","(t)","EPeventFire","additional_src","300","____POP","openx","is_noadblock","window.location","()","hblocked","AdBlockUtil","css_class.show","/adbl/i","error","elements","[src]","CANG","3000","DOMContentLoaded","adlinkfly","updato-overlay","innerText","/amazon-adsystem|example\\.com/","document.cookie","|","attr","{}","scriptSrc","SmartWallSDK","segs_pop","cxStartDetectionProcess","Abd_Detector","counter","paywallWrapper","isAdBlocked","/enthusiastgaming|googleoptimize|googletagmanager/","css_class","ez","0.02","path","*.adserverDomain","10","JSON.parse","$getWin","/doubleclick|googlesyndication/","__NEXT_DATA__.props.clientConfigSettings.videoAds","blockAds","_ctrl_vt.blocked.ad_script","registerSlideshowAd","50","debugger","mm","shortener","require","/^(?!.*(einthusan\\.io|yahoo|rtnotif|ajax|quantcast|bugsnag))/","caca","getUrlParameter","trigger","Ok","given","getScriptFromCss","method:HEAD","safelink.adblock","goafricaSplashScreenAd","try","/adnxs.com|onetag-sys.com|teads.tv|google-analytics.com|rubiconproject.com|casalemedia.com/","openPopunder","0x","xhr.prototype.realSend","initializeCourier","userAgent","_0xbeb9","1800","popAdsClickCount","redirectPage","adblocker","ad_","azar","popunderSetup","https","popunder","preventExit","hilltop","jsPopunder","aadblock","S9tt","popUpUrl","Notification","srcdoc","iframe","readCookieDelit","Object.defineProperty","trafficjunky","checked","input#chkIsAdd","adSSetup","adblockerModal","ads","750","html","capapubli","Aloader.serve","mouseup","sp_ad","app_vars.force_disable_adblock","adsHeight","onmousemove","button","yuidea-","adsBlocked","_sp_.msg.displayMessage","pop_under","location.href","_0x32d5","url","blur","CaptchmeState.adb","glxopen","adverts-top-container","/googlesyndication|outbrain/","CekAab","timeLeft","testadblock","document.addEventListener","google_ad_client","UhasAB","adbackDebug","googletag","performance","rbm_block_active","SubmitDownload1","show()","user=null","getIfc","adblockcheck","!bergblock","overlayBtn","adBlockRunning","Date","htaUrl","_pop","n.trigger","CnnXt.Event.fire","_ti_update_user","&nbsp","document.body.appendChild","BetterJsPop","/.?/","setExoCookie","adblockDetected","frg","abDetected","target","I833","urls","urls.0","Object.assign","KeepOpeningPops","bindall","ad_block","time","KillAdBlock","read_cookie","ReviveBannerInterstitial","eval","GNCA_Ad_Support","checkAdBlocker","midRoll","adBlocked","Date.now","AdBlock","iframeTestTimeMS","runInIframe","deployads","='\\x","Debugger","stackDepth:3","warning","100","_checkBait","[href*=\"ccbill\"]","close_screen","onerror","dismissAdBlock","VMG.Components.Adblock","adblock_popup","FuckAdBlock","isAdEnabled","promo","_0x311a","mockingbird","adblockDetector","crakPopInParams","console.log","hasPoped","Math.round","flashvars.protect_block","flashvars.video_click_url","h1mm.w3","banner","google_jobrunner","blocker_div","onscroll","keep-ads","#rbm_block_active","checkAdblock","checkAds","#DontBloxMyAdZ","#pageWrapper","adpbtest","initDetection","alert","check","length:10","{\"type\":\"cors\"}","isBlanketFound","showModal","2500","myaabpfun","sec","_wm","adFilled","15000","//","NativeAd","gadb","damoh.ani-stream.com","showPopup","mouseout","clientWidth","adrecover","checkadBlock","gandalfads","Tool","cmnnrunads","downloadJSAtOnload","run","ReactAds","phtData","adBlocker","StileApp.somecontrols.adBlockDetected","killAdBlock","innerHTML","google_tag_data","readyplayer","noAdBlock","autoRecov","adblockblock","popit","popstate","noPop","Ha","rid","[onclick^=\"window.open\"]","spot","adsOk","adBlockChecker","_$","12345","flashvars.popunder_url","urlForPopup","isal","/innerHTML|AdBlock/","checkStopBlock","overlay","setInterval","popad","!za.gl","document.hidden","adblockEnabled","ppu","adspot_top","is_adblocked","/offsetHeight|google|Global/","an_message","Adblocker","native code","pogo.intermission.staticAdIntermissionPeriod","localStorage","timeoutChecker","t","my_pop","nombre_dominio",".height","!?safelink_redirect=","document.documentElement","break;case $.","time.html","block_detected","/^(?:mousedown|mouseup)$/","ckaduMobilePop","Math.random","tieneAdblock","popundr","obj","ujsmediatags method:HEAD","adsAreBlocked","spr","document.oncontextmenu","document.onmousedown","document.onkeydown","compupaste","redirectURL","bait","!atomtt","TID","!/download\\/|link/","Math.pow","adsanity_ad_block_vars","pace","ai_adb","openInNewTab",".append","!!{});","runAdBlocker","pa","setOCookie","document.getElementsByClassName","td_ad_background_click_link","initBCPopunder","flashvars.logo_url","flashvars.logo_text","nlf.custom.userCapabilities","displayCookieWallBanner","adblockinfo","JSON","pum-open","svonm","/\\/VisitorAPI\\.js|\\/AppMeasurement\\.js/","popjs","/adblock/i","count","LoadThisScript","showPremLite","closeBlockerModal","5","keydown","Popunder","ag_adBlockerDetected","document.head.appendChild","bait.css","Date.prototype.toGMTString","initPu","jsUnda","ABD","adBlockDetector.isEnabled","adtoniq","__esModule","break","myFunction_ads","areAdsDisplayed","gkAdsWerbung","pop_target","onLoadEvent","is_banner","$easyadvtblock","mfbDetect","Pub2a","block","console","send","ab_cl","V4ss","#clickfakeplayer","popunders","visibility","sadbl","break;case","aclib","show_dfp_preroll","show_youtube_preroll","brave_load_popup","pageParams.dispAds","PrivateMode","scroll","document.bridCanRunAds","doads","pu","MessageChannel","advads_passive_ads","tmohentai","pmc_admanager.show_interrupt_ads","ai_adb_overlay","AlobaidiDetectAdBlock","jwplayer.utils.Timer","showMsgAb","Advertisement","type","input[value^=\"http\"]","wutimeBotPattern","$REACTBASE_STATE.serverModules.push","popup_ads","ipod","pr_okvalida","scriptwz_url","enlace","Popup","$.ajax","appendChild","Exoloader","offsetWidth","zomap.de","/$|adBlock/","adblockerpopup","adblockCheck","checkVPN","cancelAdBlocker","Promise","setNptTechAdblockerCookie","for-variations","!api?call=","cnbc.canShowAds","ExoSupport","/^(?:click|mousedown|mouseup)$/","di()","getElementById","loadRunative","value.media.ad_breaks","onAdVideoStart","zonefile","pwparams","fuckAdBlock","firefaucet","mark","stop-scrolling","detectAdBlock","Adv","blockUI","adsafeprotected","'\\'","oncontextmenu","Base64","disableItToContinue","google","parcelRequire","mdpDeBlocker","flashvars.adv_start_html","adv","mobilePop","/_0x|debug/","my_inter_listen","EviPopunder","adver","tcpusher","preadvercb","document.readyState","prerollMain","/^(click|mousedown|mousemove|touchstart|touchend|touchmove)/","popping","adsrefresh","/ai_adb|_0x/","canRunAds","mdp_deblocker","adBlock","bi()","#divDownload","modal","dclm_ajax_var.disclaimer_redirect_url","$ADP","load_pop_power","MG2Loader","/SplashScreen|BannerAd/","Connext","break;","checkTarget","i--","Time_Start","blocker","adUnits","afs_ads","b2a","data.[].vast_url","deleted","MutationObserver","LIDetector","ezstandalone.enabled","damoh","foundation.adPlayer.bitmovin","homad-global-configs","weltConfig.switches.videoAdBlockBlocker","XMLHttpRequest.prototype.open","svonm.com","adReinsertion","window.__gv_org_tfa","Object.prototype.adReinsertion.homad.enabled","getHomadConfig","timeupdate","testhide","getComputedStyle","doOnce","popi","googlefc","angular","detected","{r()","450","ab","go_popup","Debug","offsetHeight","length","noBlocker","/youboranqs01|spotx|springserve/","js-btn-skip","r()","adblockActivated","penci_adlbock","Number.isNaN","fabActive","gWkbAdVert","noblock","!gdrivedownload","document.onclick","daCheckManager","prompt","data-popunder-url","saveLastEvent","friendlyduck",".post.movies","purple_box","detectAdblock","adblockDetect","adsLoadable","allclick_Public","a#clickfakeplayer",".fake_player > [href][target]",".link","'\\x","initAdserver","splashpage.init","window[_0x","checkSiteNormalLoad","/blob|injectedScript/","ASSetCookieAds","adConfig","___tp","STREAM_CONFIGS",".clickbutton","Detected","XF","hide","mdp",".test","backgroundBanner","interstitial","letShowAds","antiblock","ulp_noadb",".show","url:!luscious.net","Object.prototype.adblock_detected","afterOpen","AffiliateAdBlock",".appendChild","adsbygoogle.loaded","ads_unblocked","xxSetting.adBlockerDetection","ppload","RegAdBlocking","a.adm","checkABlockP","Drupal.behaviors.adBlockerPopup","ADBLOCK","fake_ad","samOverlay","!refine?search","native","koddostu_com_adblock_yok","player.ads.cuePoints","adthrive","!t.me","bADBlock","secondsLeft","better_ads_adblock","tie","Adv_ab","ignore_adblock","$.prototype.offset","ea.add","ad_pods.0.ads.0.segments.0.media ad_pods.1.ads.1.segments.1.media ad_pods.2.ads.2.segments.2.media ad_pods.3.ads.3.segments.3.media ad_pods.4.ads.4.segments.4.media ad_pods.5.ads.5.segments.5.media ad_pods.6.ads.6.segments.6.media ad_pods.7.ads.7.segments.7.media ad_pods.8.ads.8.segments.8.media","mouseleave","NativeDisplayAdID","t()","zendplace","mouseover","event.triggered","_cpp","sgpbCanRunAds","pareAdblock","ppcnt","data-ppcnt_ads","main[onclick]","Blocker","AdBDetected","navigator.brave","clickCount","hasFocus","timeSec","getlink","/wpsafe|wait/","timer","/getElementById|gotoo/","/visibilitychange|blur/","stopCountdown","tid","ppuQnty","web_share_ads_adsterra_config wap_short_link_middle_page_ad wap_short_link_middle_page_show_time data.ads_cpm_info","value","Object.prototype.isAllAdClose","DOMNodeRemoved","data.meta.require_addon data.meta.require_captcha data.meta.require_notifications data.meta.require_og_ads data.meta.require_video data.meta.require_web data.meta.require_related_topics data.meta.require_custom_ad_step data.meta.og_ads_offers data.meta.addon_url data.displayAds data.linkCustomAdOffers","data.getDetailPageContent.linkCustomAdOffers.[-].title","data.getTaboolaAds.*","/chp_?ad/","tp-time","/adblock|isRequestPresent/","bmcdn6","window.onload","devtools","documentElement.innerHTML","{\"type\": \"opaque\"}","document.hasFocus","/adoto|\\/ads\\/js/","htmls","?key=","isRequestPresent","xmlhttp","data-ppcnt_ads|onclick","#main","#main[onclick*=\"mainClick\"]","stay","disabled",".btn-primary","focusOut","googletagmanager","suaads","/window\\.location\\.href|n/","8000","/\\$\\('|ai-close/","app_vars.please_disable_adblock","/scorecardresearch\\.com|outbrain\\.com|taboola\\.com|criteo\\.net|rubiconproject\\.com|adform\\.net|casalemedia\\.com|adservice\\.google\\.com/","shouldOpenPopUp","/blur|focus/","bypass",".MyAd > a[target=\"_blank\"]","antiAdBlockerHandler","onScriptError","php","div_form","private","navigator.webkitTemporaryStorage.queryUsageAndQuota","contextmenu","visibilitychange","remainingSeconds","0.1","/(?=[\\s\\S]*(?:isTrusted|defaultPrevented|button))(?=[\\s\\S]*(?:ctrlKey|metaKey|shiftKey|altKey))(?=[\\s\\S]*(?:getAttribute|tagName))(?=[\\s\\S]*Date\\s*\\.\\s*now)/","document","/pagead2\\.googlesyndication\\.com|inklinkor\\.com/","EventTarget.prototype.addEventListener","delete window","/checkAdblockUser|bypOnSyntheticClick/","/countdown--|getElementById/","checkBrowser","bypass_url","1600","showadas","submit","validateForm","throwFunc","SMart1","/outbrain\\.com|adligature\\.com|quantserve\\.com|srvtrck\\.com|googlesyndication|pubadx/","{\"type\": \"cors\"}","doTest","checkAdsBlocked",".btn","fetch","http","Element.prototype.closest","rel","chp_ad","document.documentElement.lang.toLowerCase","maxclick","#get-link-button","Swal.fire","surfe.pro","czilladx","adsbygoogle.js","!devuploads.com","war:googlesyndication_adsbygoogle.js","window.adLink","localStorage._d","blank","sensorsDataAnalytic201505","vizier","checkAdBlock","googlesyn","displayAdBlockerMessage","pastepc","checkMockObjects","detectedAdblock","pagead2.googlesyndication.com/pagead/js/adsbygoogle.js","googletagservices","HTMLScriptElement.prototype.onerror","isTabActive","[href*=\"survey\"]","adForm","clicked","2","charCodeAt","decodeURIComponent(escape","clicksCount","if","prevent","..directLink","..props[?.children*=\"clicksCount\"].children","adskeeper",".downloadbtn","zigi_tag_id","self.Math","setCookie","advertisement3","start","AdLink","!buzzheavier.com","removeChild",".href","notifyExec","fairAdblock","data.value data.redirectUrl data.bannerUrl","/admin/settings","!gcloud","/seconds--|timeLeft--/","/pub\\.clickadu|bing\\.com/","a","/blocked|null/","remaining--","!/document|window|const|var|let/","RegExp.prototype.exec.constructor","\"+\"","Function.prototype.constructor","anonymous@https","Document.prototype.addEventListener.call","HTMLElement.prototype.click.call","HTMLElement.prototype.click.apply","/document.createElement|window.open/",".cfd","inert","main.fr-download-main","quitAfter","data-fr-detection","body","/outbrain\\.com|adligature\\.com|quantserve\\.com|srvtrck\\.com/","HTMLElement.prototype.offsetHeight","uplcm.com","script[data-domain=","document.body.appendChild(s)","document.head||","push",".call(null)","ov.advertising.tisoomi.loadScript","(null)","abp","userHasAdblocker","embedAddefend","/injectedScript.*inlineScript/","/(?=.*onerror)(?=^(?!.*(https)))/","/injectedScript|blob/","hommy.mutation.mutation","hommy","hommy.waitUntil","ACtMan","video.channel","/popundersPerIP[\\s\\S]*?Date[\\s\\S]*?getElementsByTagName[\\s\\S]*?insertBefore/","clearTimeout","WebAssembly","shouldShow","matchMedia","target.appendChild(s","l.appendChild(s)","document.body.appendChild(s","no-referrer-when-downgrade","Object.prototype.loadHillTopBanner","/^data:/","appendTo:","myEl","ExoDetector","!embedy","Pub2","/loadMomoVip|loadExo|includeSpecial/","loadNeverBlock","flashvars.mlogo","adver.abFucker.serve","displayCache","vpPrerollVideo","SpecialUp","flashvars","v2:$./^adv_/","zfgloaded","parseInt","/btoa|break/","/\\st\\.[a-zA-Z]*\\s/","navigator","/(?=^(?!.*(https)))/","key in document","zfgformats","zfgstorage","zfgloadedpopup","/\\st\\.[a-zA-Z]*\\sinlineScript/","zfgcodeloaded","outbrain","/inlineScript|stackDepth:1/","Date.prototype.toISOString","wpadmngr.com","adserverDomain","AtcshAltNm",".js?_=","FingerprintJS","/https|stackDepth:3/","HTMLAllCollection","shown_at","!/d/","PlayerConfig.config.CustomAdSetting","[]","affiliate","_createCatchAllDiv","/click|mouse/","[native code]","PlayerConfig.trusted","PlayerConfig.config.AffiliateAdViewLevel","3","univresalP","puTSstrpcht","!/prcf.fiyar|themes|pixsense|.jpg/","hold_click","focus","js_func_decode_base_64","decodeURIComponent(atob","/(?=^(?!.*(https|injectedScript)))/","jQuery.popunder","AdDetect","ai_front","abDetectorPro","/googlesyndication|doubleclick/","src=atob","tie.ad_blocker_detector","admiral","gnt.x.uam","runAt","interactive","gnt.u.z","..admiralScriptCode",".props[?.id==\"admiral-bootstrap\"].dangerouslySetInnerHTML","decodeURI(decodeURI","dc.adfree","__INITIAL_DATA__.siteData.admiralScript",".cmd.unshift","/admiral/","runtimeConfig.AM_PATH","CACHE",".indexOf","/runtime-config","__disableAds","..props.children.*[?.key==\"admiral-script\"]","/ad\\.doubleclick\\.net|static\\.dable\\.io/","error-report.com","loader.min.js","content-loader.com","script[id][onerror]","asap","loadShield",".scriptLoader.*[?.id==\"ad_stack_split_provider\"]","adLight","objAd.loadAdShield","window.myAd.runAd","RT-1562-AdShield-script-on-Huffpost","/content-loader\\.com|css-load\\.com|html-load\\.com/","html-load.com","__cfRLUnblockHandlers","disableAdShield","page-kit.io","abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=","/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/i","features.ad02 features.adshield","..props[?.id==\"ad-shield\"].dangerouslySetInnerHTML","/ad-shield/","AHE.is_member","-load.com/script/","length:101",")](this,...","3000-6000","AppBootstrapData.config.adshieldAdblockRecovery","AppBootstrapData.config.adshieldNativeAdRecovery","AppBootstrapData.__initializeFeatures__.adshieldAdblockRecovery.enabled","AppState.reduxState.features.adshieldAdblockRecovery","/error-report|nowprocket/","/loadRecoveryScripts|nowprocket/","autoRecovery","__benjiAdblock","Object.prototype._adShieldLoaded",".featureFlags.*[?.featureName==\"AdShield\"]","/configs","Object.prototype.htmlLoadScriptService.loadScript","Object.prototype.removeAdScripts","HTMLScriptElement.prototype.onload","objVc.ad_shield_wap","..ad_shield_wap","/ad_shield_wap/","/sitemaps","String.prototype.match","__adblocker","_contentWindow","__INITIAL_STATE__.config.theme.ads.isAdBlockerEnabled","generalTimeLeft","__INITIAL_STATE__.gameLists.gamesNoPrerollIds.indexOf","__aaZoneid","DoodPop","#over","document.ontouchend","HTMLElement.prototype.click","playID","openNewTab","download-wrapper","MDCore.adblock","Please wait","#downloadvideo","unescape","/blocker|detected/","/^function\\(\\)\\{const t=Date\\.now.+window\\.open\\(e\\.url/","ads playerAds","displayLayer","adId","pop_init","adsbyjuicy","np.detect","onerror|onload","script[onerror][onload]","/eval|aabcBoot/","dataset.zone","length:40000-60000","mode:no-cors","prerolls midrolls postrolls comm_ad house_ad pause_ad block_ad end_ad exit_ad pin_ad content_pool vertical_ad elements","/detail","adClosedTimestamp","data.item.[-].business_info.ad_desc","/feed/rcmd","killads","NMAFMediaPlayerController.vastManager.vastShown","api/v1/detail","xmxalr","HTMLIFrameElement.prototype.contentWindow","reklama-flash-body","/scoreUrl|pingUrl/","appPageData.appAds","appPageData.appAdsHandles","fakeAd","adUrl",".azurewebsites.net","assets.preroll assets.prerollDebug","/stream-link","/doubleclick|ad-delivery|googlesyndication/","__NEXT_DATA__.runtimeConfig._qub_sdk.qubConfig.video.adBlockerDetectorEnabled","__NEXT_DATA__.runtimeConfig._qub_sdk.qubConfig.ad.adBlockerDetectorEnabled","history.replaceState","data.[].relationships.advert data.[].relationships.vast","jwpConfig",".advertising","offers","tampilkanUrl","__ninjaAdMaxAbdLoaded",".layers.*[?.metadata.name==\"POI_Ads\"]","/PCWeb_Real.json",".*[?.adId]","consent","arePiratesOnBoard","__INIT_CONFIG__.randvar","instanceof Event","prebidConfig.steering.disableVideoAutoBid","xml","await _0x","adblock.js","adbl",".getComputedStyle","STORAGE2","app_advert","googletag._loaded_","closeBanner","NoTenia","breaks interstitials info","interstitials","xpath(//*[name()=\"Period\"][.//*[name()=\"BaseURL\" and contains(text(),\".mp.lura.live/prod/\")]] | //*[name()=\"MPD\"]/@mediaPresentationDuration)",".mpd","ads.policy.skipMode","/play","ad_slots","plugins.dfp","lura.live/prod/","/prog.m3u8","!embedtv.best","pop_","Array.isArray","POP_URL","[style*=\"z-index\"]","remove()","(!1)","backRedirect","adv_pre_duration","adv_post_duration",".offsetHeight","!asyaanimeleri.",".*[?.linkurl^=\"http\"]","initPop","app._data.ads","message","adsense","/api/video","Object.prototype.showInterstitialAd","skipAdblockCheck","data.header_script data.footer_script data.direct_link_ads data.direct_link_ads_vip_1 data.direct_link_ads_vip_2 data.direct_link_ads_play_vip_2 data.direct_link_ads_zoom_vip_2","/config","createAgeModal","Object[_0x","adsPlayer","pauseAd","popup=","()}",".art-control-fullscreen","shopeeLinks","pubAdsService","offsetLeft","config.pauseInspect","appContext.adManager.context.current.adFriendly","HTMLIFrameElement",".style","dsanity_ad_block_vars","show_download_links","downloadbtn","height","blockAdBlock._options.baitClass","/AdBlock/i","charAt","fadeIn","checkAD","latest!==","detectAdBlocker",".ready","/'shift'|break;/","xpv","xpv.v",".clientHeight===0","document.blocked_var","____ads_js_blocked","wIsAdBlocked","WebSite.plsDisableAdBlock","css","videootv","ads_blocked","samDetected","Drupal.behaviors.agBlockAdBlock","NoAdBlock","mMCheckAgainBlock","countClicks","settings.adBlockerDetection","eabdModal","ab_root.show","gaData","wrapfabtest","fuckAdBlock._options.baitClass","$ado","/ado/i","app.js","popUnderStage","samAdBlockAction","googlebot","advert","bscheck.adblocker","qpcheck.ads","tmnramp","!sf-converter.com","ad","show_ads","ignielAdBlock","isContentBlocked","GetWindowHeight","/pop|wm|forceClick/","CloudflareApps.installs.Ik7rmQ4t95Qk.options.measureDomain","detectAB1",".init","ActiveXObject","uBlockOriginDetected","/_0x|localStorage\\.getItem/","google_ad_status","googletag._vars_","googletag._loadStarted_","google_unique_id","google.javascript","google.javascript.ads","google_global_correlator","ads.servers.[].apiAddress","paywallGateway.truncateContent","Constant","u_cfg","adBlockDisabled","__NEXT_DATA__.props.pageProps.adVideo","blockedElement","/ad","onpopstate","popState","adthrive.config","ad-block-popup","exitTimer","innerHTML.replace","ajax","abu","countDown","HTMLElement.prototype.insertAdjacentHTML","_ads","clientSide.adbDetect","eabpDialog","TotemToolsObject","puHref","flashvars.adv_postpause_vast","/Adblock|_ad_/","advads_passive_groups","GLX_GLOBAL_UUID_RESULT","Pop","f.parentNode.removeChild(f)","swal","keepChecking","t.pt","clickAnywhere urls","a[href*=\"/ads.php\"][target=\"_blank\"]","nitroAds","class.scroll","/showModal|isBlanketFound/","disableDeveloperTools","[onclick*=\"window.open\"]","openWindow","Check","checkCookieClick","readyToVote","12000","!vidmoly","HTMLAnchorElement.prototype.click","anchor.href","target|href","a[href^=\"//\"]","wpsite_clickable_data","insertBefore","offsetParent","meta.advertise","next","vidorev_jav_plugin_video_ads_object.vid_ads_m_video_ads","data.attributes.config.freewheel data.attributes.config.featureFlags.dPlayer","data.attributes.ssaiInfo.forecastTimeline data.attributes.ssaiInfo.vendorAttributes.nonLinearAds data.attributes.ssaiInfo.vendorAttributes.videoView data.attributes.ssaiInfo.vendorAttributes.breaks.[].ads.[].adMetadata data.attributes.ssaiInfo.vendorAttributes.breaks.[].ads.[].adParameters data.attributes.ssaiInfo.vendorAttributes.breaks.[].timeOffset","xpath(//*[name()=\"MPD\"][.//*[name()=\"BaseURL\" and contains(text(),'dash_clear_fmp4') and contains(text(),'/a/')]]/@mediaPresentationDuration | //*[name()=\"Period\"][./*[name()=\"BaseURL\" and contains(text(),'dash_clear_fmp4') and contains(text(),'/a/')]])","xpath(//*[name()=\"MPD\"][.//*[name()=\"BaseURL\" and contains(text(),\"emea-free\")]]/@mediaPresentationDuration | //*[name()=\"MPD\"][.//*[name()=\"BaseURL\" and contains(text(),\"emea-free\")]]//*[name()=\"Period\"]/@start | //*[name()=\"Period\"][./*[name()=\"BaseURL\" and contains(text(),\"emea-free\")]])","ssaiInfo","data.attributes.ssaiInfo","/videoPlaybackInfo","adsProvider.init","SDKLoaded","css_class.scroll","mnpwclone","0.3","7000","[href*=\"nihonjav\"]","/null|Error/","bannersRequest","/atob|overlay/","vads","doSecondPop","a[href][onclick^=\"getFullStory\"]","!newdmn","/parentNode\\.removeChild|textContent=atob/","popUp","devtoolschange","rccbase_styles","POPUNDER_ENABLED","plugins.preroll","DHAntiAdBlocker","/out.php","ishop_codes","#advVid","location.replace","showada","showax","adp","__tnt","compatibility","popundrCheck","rexxx.swp","constructor","p18","clickHandler","onbeforeunload","window.location.href","prebid","ADBLOCKED","Object.prototype.adsEnabled","ai_run_scripts","clearInterval(i)","ospen","pu_count","mypop","adblock_use","Object.prototype.adblockFound","adn","download","1100","createCanvas","bizpanda","__spotSettings","/pop|_blank/","movie.advertising.ad_server playlist.movie.advertising.ad_server","unblocker","playerAdSettings.adLink","playerAdSettings.waitTime","computed","manager","window.location.href=link","moonicorn.network","/dyn\\.ads|loadAdsDelayed/","xv.sda.pp.init","xv.conf.dyn.ads","xv.conf.dyn.excld","onreadystatechange","MediaContainer.Metadata.[].Ad","doubleclick.com","opaque","_init","href|target|data-ipshover-target|data-ipshover|data-autolink|rel","a[href^=\"https://thumpertalk.com/link/click/\"][target=\"_blank\"]","/touchstart|mousedown|click/","latest","secs","event.simulate","isAdsLoaded","adblockerAlert","/^https?:\\/\\/redirector\\.googlevideo\\.com.*/","/.*m3u8/","cuepoints","cuepoints.[].start cuepoints.[].end cuepoints.[].start_float cuepoints.[].end_float","Period[id*=\"-roll-\"][id*=\"-ad-\"]","pubads.g.doubleclick.net/ondemand","/ads/banner","reachGoal","Element.prototype.attachShadow","Adb","randStr","SPHMoverlay","ai","timer.remove","popupBlocker","afScript","Object.prototype.parseXML","Object.prototype.blackscreenDuration","Object.prototype.adPlayerId","/ads",":visible","mMcreateCookie","downloadButton","SmartPopunder.make","readystatechange","document.removeEventListener",".button[href^=\"javascript\"]","animation","status","adsblock","pub.network","timePassed","timeleft","input[id=\"button1\"][class=\"btn btn-primary\"][disabled]","t(a)",".fadeIn()","result","evolokParams.adblock","[src*=\"SPOT\"]","asap stay",".pageProps.__APOLLO_STATE__.*[?.__typename==\"AotSidebar\"]","/_next/data","pageProps.__TEMPLATE_QUERY_DATA__.aotFooterWidgets","props.pageProps.data.aotHomepageTopBar props.pageProps.data.aotHomepageTopBar props.pageProps.data.aotHeaderAdScripts props.pageProps.data.aotFooterWidgets","counter--","daadb","l-1","_htas","magnificPopup","skipOptions","method:HEAD url:doubleclick.net","xpath(//*[name()=\"Period\"][.//*[name()=\"BaseURL\" and contains(text(),\"https:\")]])","style.display","tvid.in/log","1150","0.5","testadtags ad","document.referrer","history.pushState","loadjscssfile","/debugger|offsetParent/","/ads|imasdk/","6","__NEXT_DATA__.props.pageProps.adsConfig","cookie","make_rand_div","new_config.timedown","catch","google_ad","response.timeline.elements.[-].advertiserId","url:/api/v2/tabs/for_you","timercounter","document.location","innerHeight","cainPopUp","#timer","!bowfile.com","cloudfront.net/?","href|target|data-onclick","a[id=\"dl\"][data-onclick^=\"window.open\"]","a.getAttribute(\"data-ad-client\")||\"\"","truex","truex.client","answers","!display","/nerveheels/","No","foreverJQ","/document.createElement|stackDepth:2/","container.innerHTML","top-right","hiddenProxyDetected","SteadyWidgetSettings.adblockActive","temp","inhumanity_pop_var_name","url:googlesyndication","enforceAdStatus","load_ads","starPop","Element.prototype.matches","litespeed","__PoSettings","HTMLSelectElement","youtube","aTagChange","Object.prototype.ads","display","a[onclick^=\"setTimeout\"]","detectBlockAds","analytics","eb","/analytics|livestats/","/nextFunction|2000/","resource_response.data.[-].pin_promotion_id resource_response.data.results.[-].pin_promotion_id","initialReduxState.pins.{-}.pin_promotion_id initialReduxState.resources.UserHomefeedResource.*.data.[-].pin_promotion_id","player","mahimeta","__htas","chp_adblock_browser","Request","/adb/i","tdBlock",".t-out-span [href*=\"utm_source\"]","src",".t-out-span [src*=\".gif\"]","localStorage['\\x","notifier","penciBlocksArray",".panel-body > .text-center > button","modal-window","isScrexed","fallbackAds","popurl","SF.adblock","() => n(t)","() => t()","startfrom","Math.imul","checkAdsStatus","sentry","wtg-ads","/ad-","void 0","/__ez|window.location.href/","D4zz","Object.prototype.ads.nopreroll_",").show()","/open.*_blank/","advanced_ads_ready","loadAdBlocker","HP_Scout.adBlocked","SD_IS_BLOCKING","isBlocking","adFreePopup","Object.prototype.isPremium","__BACKPLANE_API__.renderOptions.showAdBlock",".quiver-cam-player--ad-not-running.quiver-cam-player--free video","debug","Object.prototype.isNoAds","tv3Cmp.ConsentGiven","distance","site-access","chAdblock","/,ad\\n.+?(?=#UPLYNK-SEGMENT)/gm","/uplynk\\.com\\/.*?\\.m3u8/","remaining","/ads|doubleclick/","/Ads|adbl|offsetHeight/",".innerHTML","onmousedown",".ob-dynamic-rec-link","setupSkin","/app.js","dqst.pl","PvVideoSlider","_chjeuHenj","[].data.searchResults.listings.[-].targetingSegments","noConflict","preroll_helper.advs","/show|innerHTML/","create_ad","contador","Object.prototype.enableInterstitial","addAds","/show|document\\.createElement/","loadXMLDoc","register","MobileInGameGames","__osw","uniconsent.com","/coinzillatag|czilladx/","divWidth","Script_Manager","Script_Manager_Time","bullads","Msg","!download","/click|mousedown/","adjsData","AdService.info.abd","UABP","adBlockDetectionResult","popped","/xlirdr|hotplay\\-games|hyenadata/","document.body.insertAdjacentHTML","exo","tic","download_loading","detector_launch","pu_url","Click","afStorage","google.ima.OmidVerificationVendor","Object.prototype.omidAccessModeRules","puShown1","onAdblockerDetected","htmlAds","second","lycos_ad","150","passthetest","checkBlock","/thaudray\\.com|putchumt\\.com/","popName","vlitag","asgPopScript","/(?=^(?!.*(jquery|turnstile|challenge-platform)))/","Object.prototype.loadCosplay","Object.prototype.loadImages","FMPoopS","/window\\['(?:\\\\x[0-9a-f]{2}){2}/","urls.length","importantFunc","console.warn","sam","current()","confirm","pandaAdviewValidate","showAdBlock","aaaaa-modal","/(?=^(?!.*(http)))/","()=>","$onet","adsRedirectPopups","canGetAds","method:/head/i","length:11000","goToURL","ad_blocker_active","init_welcome_ad","setinteracted",".MediaStep","data.xdt_injected_story_units.ad_media_items","dataLayer","document.body.contains","nothingCanStopMeShowThisMessage","window.focus","imasdk","fakeElement","adEnable","adtech-brightline adtech-google-pal adtech-iab-om","/playbackInfo","fallback.ssaiInfo manifest.url","fallback.ssaiInfo","xpath(//*[name()=\"MPD\"]/@mediaPresentationDuration | //*[name()=\"Period\"]/@start | //*[name()=\"Period\"][not(.//*[name()=\"SegmentTimeline\"])][not(.//*[name()=\"ContentProtection\"])] | //*[name()=\"Period\"][./*[name()=\"BaseURL\"]][not(.//*[name()=\"ContentProtection\"])][not(.//*[name()=\"AdaptationSet\"][@contentType=\"text\"])])","/dash.mpd","xpath(//*[name()=\"MPD\"]/@mediaPresentationDuration | //*[name()=\"Period\"]/@start | //*[name()=\"Period\"][not(.//*[name()=\"SegmentTimeline\"])][not(.//*[name()=\"ContentProtection\"])] | //*[name()=\"Period\"][./*[name()=\"BaseURL\"]][not(.//*[name()=\"ContentProtection\"])])","/-vod-.+\\.mpd/","htmlSectionsEncoded","event.dispatch","adx","popupurls","displayAds","cls_report?","arrvast","-0x1","childNodes","wbar","[href=\"/bestporn.html\"]","_adshrink.skiptime","gclid","event","!yt1d.com","AbleToRunAds","PreRollAd.timeCounter","result.ads","tpc.googlesyndication.com","id","#div-gpt-ad-footer","#div-gpt-ad-pagebottom","#div-gpt-ad-relatedbottom-1","#div-gpt-ad-sidebottom","goog","document.body","abpblocked","p$00a","openAdsModal","paAddUnit","gloacmug.net","items.[-].potentialActions.0.object.impressionToken items.[-].hasPart.0.potentialActions.0.object.impressionToken","context.adsIncluded","refresh","adt","Array.prototype.indexOf","interactionCount","/cloudfront|thaudray\\.com/","test_adblock","googletag.cmd.push","/googletag\\.pubads|\\/PreBid\\.js/","vastEnabled","/adskeeper|cloudflare/","detectadsbocker","c325","ga","two_worker_data_js.js","adobeModalTestABenabled","FEATURE_DISABLE_ADOBE_POPUP_BY_COUNTRY","questpassGuard","isAdBlockerEnabled","shortConfig","akadb","eazy_ad_unblocker","adswizz.com","document.onkeypress","adsSrc","sssp","emptyObj","[style*=\"background-image: url\"]","[href*=\"click?\"]","/freychang|passback|popunder|tag|banquetunarmedgrater/","google-analytics","myTestAd","Ads","smartLoaded","ShowAdBLockerNotice","ad_listener","!shrdsk","notify","AdB","push-allow-modal",".hide","(!0)","Delay","ima","Cookiebot","stream.insertion.adSession stream.insertion.points stream.insertion stream.sources.*.insertion pods.0.ads","ads.metadata ads.document ads.dxc ads.live ads.vod","site-access-popup","*.tanya_video_ads","deblocker","data?","script.src","/#EXT-X-DISCONTINUITY.{1,100}#EXT-X-DISCONTINUITY/gm","mixed.m3u8","feature_flags.interstitial_ads_flag","feature_flags.interstitials_every_four_slides","?","downloadToken","waldoSlotIds","Uint8Array","redirectpage","13500","adblockstatus","adScriptLoaded","/adoto|googlesyndication/","props.sponsoredAlternative","ad-delivery","document.documentElement.lang","adSettings","banner_is_blocked","VAST","WP.prebid","onLoad","Object.prototype.rekids","Object.prototype.gafSlot","Object.prototype.advViewability","WP.inline","/getComputedStyle[\\s\\S]*?style\\.display=\"none\"[\\s\\S]*?styleBlocked[\\s\\S]*?detected/","__headpayload","WP","r https","WP.gaf.loadBunch","Object.prototype.loadBunch","Object.prototype.bodyCode","consoleLoaded?clearInterval","decodeURL","updateProgress","/salesPopup|mira-snackbar/","Object.prototype.adBlocked","DOMAssistant","rotator","adblock popup vast","detectImgLoad","200","killAdKiller","current-=1","/zefoy\\.com\\S+:3:1/","/getComputedStyle|bait/","AController_3",".clientHeight","googleAd","/showModal|chooseAction|doAction|callbackAdsBlocked/","_shouldProcessLink","cpmecs","/adlink/i","[onclick]","noreferrer","[onload^=\"window.open\"]","dontask","aoAdBlockDetected","button[onclick^=\"window.open\"]","function(e)","touchstart","Brid.A9.prototype.backfillAdUnits","adlinkfly_url","siteAccessFlag","/adblocker|alert/","redURL","/children\\('ins'\\)|Adblock|adsbygoogle/","dct","slideShow.displayInterstitial","openPopup","Object.getPrototypeOf","plugins","ai_wait_for_jquery","pbjs","tOS2","ips","Error","/stackDepth:1\\s/","tryShowVideoAdAsync","chkADB","onDetected","detectAdblocker","document.ready","a[href*=\"torrentico.top/sim/go.php\"]","success.page.spaces.player.widget_wrappers.[].widget.data.intervention_data",".props.pageProps.page.blocks.*[?..resource^=\"nc-ad\"]","navigator.standalone","google.ima.settings.setDisableFlashAds","empire.pop","empire.direct","empire.directHideAds","pagead2.googlesyndication.com","empire.mediaData.advisorMovie","empire.mediaData.advisorSerie","fuckadb","[type=\"submit\"]","setTimer","auto_safelink","!abyss.to","daadb_get_data_fetch","penci_adlbock.ad_blocker_detector","siteAccessPopup","/adsbygoogle|adblock|innerHTML|setTimeout/","/innerHTML|_0x/","Object.prototype.adblockDetector","biteDisplay","blext","/[a-z]\\(!0\\)/","800","vidorev_jav_plugin_video_ads_object","vidorev_jav_plugin_video_ads_object_post","dai_iframe","popactive","/detectAdBlocker|window.open/","S_Popup","eazy_ad_unblocker_dialog_opener","rabLimit","-1","popUnder","/GoToURL|delay/","nudgeAdBlock","/googlesyndication|ads/","/Content/_AdBlock/AdBlockDetected.html","adBlckActive","AB.html","feedBack.showAffilaePromo","ShowAdvertising","a img:not([src=\"images/main_logo_inverted.png\"])","visible","a[href][target=\"_blank\"],[src^=\"//ad.a-ads.com/\"]","avails","amazonaws.com","ima3_dai","topaz.","FAVE.settings.ads.ssai.prod.clips.enabled","FAVE.settings.ads.ssai.prod.liveAuth.enabled","FAVE.settings.ads.ssai.prod.liveUnauth.enabled","ssaiInfo fallback.ssaiInfo","xpath(//*[name()=\"MPD\"]/@mediaPresentationDuration | //*[name()=\"Period\"]/@start | //*[name()=\"Period\"][.//*[name()=\"BaseURL\" and contains(text(),\".prd.media.\")]])","/sandbox/i","analytics.initialized","autoptimize","UserCustomPop","method:GET","data.reg","time-events","/redirector\\.googlevideo\\.com\\/videoplayback[\\s\\S]*?dclk_video_ads/",".m3u8","phxSiteConfig.gallery.ads.interstitialFrequency","loadpagecheck","popupAt","modal_blocker","art3m1sItemNames.affiliate-wrapper","\"\"","isOpened","playerResponse.adPlacements playerResponse.playerAds adPlacements playerAds","GeneratorAds","isAdBlockerActive","pop.doEvent","'shift'","bFired","scrollIncrement","di.app.WebplayerApp.Ads.Adblocks.app.AdBlockDetectApp.startWithParent","a#downloadbtn[onclick^=\"window.open\"]","alink","/ads|googletagmanager/","sharedController.adblockDetector",".redirect","sliding","a[onclick]","infoey","settings.adBlockDetectionEnabled","displayInterstitialAdConfig","response.ads","/api","checkAdBlockeraz","blockingAds","setC","/data?|hideLayer/","popup","/atob|innerHTML/","/adScriptPath|MMDConfig/","xpath(//*[name()=\"MPD\"]/@mediaPresentationDuration | //*[name()=\"Period\"]/@start | //*[name()=\"Period\"][.//*[name()=\"BaseURL\" and contains(text(),'adease')]])","[media^=\"A_D/\"]","adease adeaseBlob vmap","adease","aab","ips.controller.register","plugins.adService","QiyiPlayerProphetData.a.data","wait","/adsbygoogle|doubleclick/","adBreaks.[].startingOffset adBreaks.[].adBreakDuration adBreaks.[].ads adBreaks.[].startTime adBreak adBreakLocations","/session.json","xpath(//*[name()=\"Period\"][.//*[name()=\"BaseURL\" and contains(text(),\"_ad\") and contains(text(),\"creative\")]] | //*[name()=\"MPD\"]/@mediaPresentationDuration | //*[name()=\"Period\"]/@start)","/\\/episode\\/.+?\\.mpd\\?/","session.showAds","toggleAdBlockInfo","cachebuster","config","OpenInNewTab_Over","/native|\\{n\\(\\)/","[style^=\"background\"]","[target^=\"_\"]","bodyElement.removeChild","aipAPItag.prerollSkipped","aipAPItag.setPreRollStatus","reklam_1_saniye","reklam_1_gecsaniye","reklamsayisi","reklam_1","psresimler","data","runad","url:doubleclick.net","war:googletagservices_gpt.js","criteo","HTMLImageElement.prototype.onerror","++","war:32x32.png","triggered","data.home.home_timeline_urt.instructions.[].entries.[-].content.itemContent.promotedMetadata","url:/Home","data.search_by_raw_query.search_timeline.timeline.instructions.[].entries.[-].content.itemContent.promotedMetadata","url:/SearchTimeline","data.threaded_conversation_with_injections_v2.instructions.[].entries.[-].content.items.[].item.itemContent.promotedMetadata","url:/TweetDetail","data.user.result.timeline_v2.timeline.instructions.[].entries.[-].content.itemContent.promotedMetadata","url:/UserTweets","data.immersiveMedia.timeline.instructions.[].entries.[-].content.itemContent.promotedMetadata","url:/ImmersiveMedia","powerAPITag","rodo.checkIsDidomiConsent","newAdblockBoardDisplayed","protection","xtime","smartpop","EzoIvent","/doubleclick|googlesyndication|vlitag/","overlays","googleAdUrl","/googlesyndication|nitropay/","uBlockActive","/api/v1/events","Scribd.Blob.AdBlockerModal","AddAdsV2I.addBlock","xpath(//*[name()=\"Period\"][.//*[name()=\"BaseURL\" and contains(text(),'/ad/')]])","/Detect|adblock|style\\.display|\\.call\\(null\\)/","/google_ad_client/","total","popCookie","/0x|sandCheck/","hasAdBlocker","ShouldShow","offset","startDownload","cloudfront","[href*=\"jump\"]","!direct","a0b","/outbrain|criteo|thisiswaldo|media\\.net|ohbayersbur|adligature|quantserve|srvtrck|\\.css|\\.js/","2000-5000","contrformpub","data.device.adsParams data.device.adSponsorshipTemplate","url:/appconfig","innerWidth",".main-wrap","window.ts","initials",".*[?.advertiser]","$./^(bannerUnderComments|bannerBottom)$/","$.xplayerPluginSettings./^(ads|banner|bannerBottom)$/","/googlesyndication|googima\\.js|imasdk/","__brn_private_mode","download_click","Object.prototype.skipPreroll","/adskeeper|bidgear|googlesyndication|mgid/","fwmrm.net","/\\/ad\\/g\\/1/","adverts.breaks","result.responses.[].response.result.cards.[-].data.offers","ADB","downloadTimer","/ads|google/","/googlesyndication|googletagservices/","DisableDevtool","eClicked","number","sync","PlayerLogic.prototype.detectADB","ads-twitter.com","all","havenclick","VAST > Ad","/tserver","Object.prototype.prerollAds","notifyMe","alertmsg","/streams","adsClasses","gsecs","adtagparameter","dvsize","52","removeDLElements","/\\.append|\\.innerHTML|undefined|\\.css|blocker|flex|\\$\\('|obfuscatedMsg/","warn","adc","majorse","completed","testerli","showTrkURL","/popunder/i","readyWait","document.body.style.backgroundPosition","invoke","ssai_manifest ad_manifest playback_info.ad_info qvt.playback_info.ad_info","Object.prototype.setNeedShowAdblockWarning","load_banner","initializeChecks","HTMLDocument","video-popup","splashPage","adList","detect-modal","/attachonce == false/","this","ifmax","adRequest","nads","nitroAds.abp","adinplay.com","onloadUI","/^data:text\\/javascript/","randomNumber","current.children","tmDetectAdBlocker","probeScript","PageLoader.DetectAb","!koyso.","adStatus","popUrl","one_time","PlaybackDetails.[].DaiVod","consentGiven","ad-block","data.searchClassifiedFeed.searchResultView.0.searchResultItemsV2.edges.[-].node.item.content.creative.clickThroughEvent.adsTrackingMetadata.metadata.adRequestId","data.me.personalizedFeed.feedItems.[-].promo.creative.clickThroughUrl.adsTrackingMetadata.metadata.adRequestId","data.me.rhrFeed.feedItems.[-].promo.creative.clickThroughUrl.adsTrackingMetadata.metadata.sponsor","mdpDeblocker","doubleclick.net","BN_CAMPAIGNS","media_place_list","...","/\\{[a-z]\\(!0\\)\\}/","canRedirect","/\\{[a-z]\\(e\\)\\}/","[].data.displayAdsV3.data.[-].__typename","[].data.TopAdsProducts.data.[-].__typename","[].data.topads.data.[-].__typename","adDetails","/secure?","data.search.products.[-].sponsored_ad.ad_source","url:/plp_search_v2?","data_source_modules.*.module_data.search_response.products.[-].sponsored_ad.ad_source","/pages/slp","GEMG.GPT.Interstitial","amiblock","karte3","18","callbackAdsBlocked","sandDetect","showcfkModal","amodule.data","emptyArr","inner-ad","_ET","jssdks.mparticle.com","session.sessionAds session.sessionAdsRequired","/session","getComputedStyle(el)","/(?=^(?!.*(orchestrate|cloudflare)))/","Object.prototype.ADBLOCK_DETECTION","/ad/","/count|verify|isCompleted/","postroll","itemList.[-].ad_info.ad_id","url:api/recommend/item_list/","/adinplay|googlesyndication/","!hidan.sh","ask","interceptClickEvent","isAdBlockDetected","pData.adblockOverlayEnabled","ad_block_detector","gtag","attached","div[class=\"share-embed-container\"]","/^\\w{11}[1-9]\\d+\\.ts/","cabdSettings","/outbrain|adligature|quantserve|adligature|srvtrck/","adsConfiguration","/vod","layout.sections.mainContentCollection.components.[].data.productTiles.[-].sponsoredCreative.adGroupId","/search","fp-screen","puURL","!vidhidepre.com","[onclick*=\"_blank\"]","[onclick=\"goToURL();\"]","a[href][onclick^=\"window.open\"]","leaderboardAd","#leaderboardAd","placements.processingFile","EV.Dab","ablk","/ethicalads\\.io|nitropay\\.com/","HTMLImageElement.prototype.onload","img","Image.prototype.complete","2d","Element.prototype.getBoundingClientRect",".length","HTMLImageElement.prototype.naturalWidth","240","#artifactFileContent","shutterstock.com","Object.prototype.adUrl","sorts.[].recommendationList.[-].contentMetadata.EncryptedAdTrackingData","/ads|chp_?ad/","ads.[-].ad_id","wp-ad","/clarity|googlesyndication/","playerEnhancedConfig.run","/aff|jump/","!/mlbbox\\.me|_self/","aclib.runPop","ADS.isBannersEnabled","button[onclick*=\"open\"]","getComputedStyle(testAd)","openPopupForChapter","Object.prototype.popupOpened","src_pop","gifs.[-].cta.link","boosted_gifs","adsbygoogle_ama_fc_has_run","doThePop","thanksgivingdelights","yes.onclick","!vidsrc.","popundersPerIP","createInvisibleTrigger","jwDefaults.advertising","elimina_profilazione","elimina_pubblicita","snigelweb.com","abd","pum_popups","checkerimg","uzivo","openDirectLinkAd","!nikaplayer.com","playlist.movie.advertising.ad_server","PopUnder","data.[].affiliate_url","cdnpk.net/v2/images/search?","data.[-].inner.ctaCopy","?page=","/gampad/ads?",".adv-","Object.prototype.DetectByGoogleAd","/adsActive|POPUNDER/i","/Executed|modal/","[breakId*=\"Roll\"]","/content.vmap","window.navigator.brave","showTav","document['\\x","showADBOverlay","springserve.com","document.documentElement.clientWidth","outbrain.com","s4.cdnpc.net/front/css/style.min.css","slider--features","s4.cdnpc.net/vite-bundle/main.css","data-v-d23a26c8","cdn.taboola.com/libtrc/san1go-network/loader.js","feOffset","hasAdblock","taboola","adbEnableForPage","/adblock|isblock/i","/\\b[a-z] inlineScript:/","result.adverts","data.pinotPausedPlaybackPage","fundingchoicesmessages","isAdblock","button[id][onclick*=\".html\"]","dclk_video_ads","ads breaks cuepoints times","streamProviders.[].adPlaylist streamProviders.[].ads","playback.","odabd","pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?ord=","b.google_reactive_tag_first","sbs.demdex.net/dest5.html?d_nsid=0&ord=","Demdex.canSetThirdPartyCookies","securepubads.g.doubleclick.net/pagead/ima_ppub_config?ippd=https%3A%2F%2Fwww.sbs.com.au%2Fondemand%2F&ord=","[\"4117\"]","configs.*.properties.componentConfigs.slideshowConfigs.*.interstitialNativeAds","url:/config","list.[].link.kicker","/content/v1/cms/api/amp/Document","properties.tiles.[-].isAd","/mestripewc/default/config","openPop","circle_animation","CountBack","990","displayAdBlockedVideo","/undefined|displayAdBlockedVideo/","cns.library","data-id|data-p","[data-id],[data-p]","BJSShowUnder","BJSShowUnder.bindTo","BJSShowUnder.add","JSON.stringify","Object.prototype._parseVAST","Object.prototype.createAdBlocker","Object.prototype.isAdPeriod","breaks custom_breaks_data pause_ads video_metadata.end_credits_time","pause_ads","/playlist","breaks","breaks custom_breaks_data pause_ads","xpath(//*[name()=\"MPD\"]/@mediaPresentationDuration | //*[name()=\"Period\"][.//*[name()=\"BaseURL\" and contains(text(),\"/ads-\")]] | //*[name()=\"Period\"][starts-with(@id,\"ad\")] | //*[name()=\"Period\"][starts-with(@id,\"Ad\")] | //*[name()=\"Period\"]/@start)","MPD Period[id^=\"Ad\"i]","consent:loaded","props.ads props.sideAd props.infoAd","/inter","ABLK","_n_app.popunder","_n_app.options.ads.show_popunders","N_BetterJsPop.object","jwplayer.vast","Fingerprent2","grecaptcha.ready","test.remove","isAdb","/click|mouse|touch/","puOverlay","opopnso","c0ZZ","cuepointPlaylist vodPlaybackUrls.result.playbackUrls.cuepoints vodPlaylistedPlaybackUrls.result.playbackUrls.pauseBehavior vodPlaylistedPlaybackUrls.result.playbackUrls.pauseAdsResolution vodPlaylistedPlaybackUrls.result.playbackUrls.intraTitlePlaylist.[-].shouldShowOnScrubBar ads","xpath(//*[name()=\"Period\"][.//*[@value=\"Ad\"]] | /*[name()=\"MPD\"]/@mediaPresentationDuration | //*[name()=\"Period\"]/@start)","[value=\"Ad\"]","xpath(//*[name()=\"Period\"][.//*[@value=\"Draper\"]] | /*[name()=\"MPD\"]/@mediaPresentationDuration | //*[name()=\"Period\"]/@start)","[value=\"Draper\"]","xpath(//*[name()=\"Period\"][.//*[name()=\"BaseURL\" and contains(text(),\"/interstitial/\")]] | /*[name()=\"MPD\"][.//*[name()=\"BaseURL\" and contains(text(),\"/interstitial/\")]]/@mediaPresentationDuration | /*[name()=\"MPD\"][.//*[name()=\"BaseURL\" and contains(text(),\"/interstitial/\")]]/*[name()=\"Period\"]/@start)","ue_adb_chk","moa_id","lifeOnwer","__videoPlayerData.popunder","jsc.mgid.com","movie.advertising.ad_server","movie.advertising","/playlist?","vast_urls","cloudflareinsights","show_adverts","runCheck","adsSlotRenderEndSeen","removedNodes.forEach","a[href][onclick^=\"openit\"]","cdgPops","pubfuture","/doubleclick|google-analytics/","flashvars.mlogo_link","'script'","/ip-acl-all.php","URLlist","adBlockNotice","aaw","aaw.processAdsOnPage","CAD.pageblockerWarning","underpop","adBlockerModal","10000-15000","/adex|loadAds|adCollapsedCount|ad-?block/i","location.reload","/function\\([a-z]\\){[a-z]\\([a-z]\\)}/","OneTrust","FOXIZ_MAIN_SCRIPT.siteAccessDetector","120000","openAdBlockPopup","drama-online","zoneid","Object.prototype._adsDisabled","Object.init","advanced_ads_check_adblocker","div[class=\"nav tabTop\"] + div > div:first-child > div:first-child > a:has(> img[src*=\"/\"][src*=\"_\"][alt]), #head + div[id] > div:last-child > div > a:has(> img[src*=\"/\"][src*=\"_\"][alt])","/(?=^(?!.*(_next)))/","[].props.slides.[-].adIndex","#ad_blocker_detector","Array.prototype.includes","adblockTrigger","20","insertAd","!/^\\/|_self|alexsports|nativesurge/","method:HEAD mode:no-cors","attestHasAdBlockerActivated","extInstalled","blockThisUrl","SaveFiles.add","detectSandbox","bait.remove","rot_url","pop_type","/rekaa","pop_tag","/HTMLDocument|blob/","=","wbDeadHinweis","()=>{var c=Kb","0.2","__venatusLoaderInit","fired","popupInterval","/go/out","adbon","*.aurl","/cs?id=","-banner","PopURL","LCI.adBlockDetectorEnabled","!y2meta","ConsoleBan","disableDevtool","ondevtoolopen","onkeydown","window.history.back","close","lastPopupTime","button#download","/^ [-\\d]/","mode:\"no-cors\"","!magnetdl.","googlesyndication.com","stoCazzo","fetchAdsScript","_insertDirectAdLink","/doubleclick|atob|return new Promise|aHR0c|String\\.fromCharCode|window\\[|headers|offsetHeight\\?/","Visibility","importFAB","uas","ast","custom_ads","/settings","url:ad/banner.gif","window.__CONFIGURATION__.adInsertion.enabled","window.__CONFIGURATION__.features.enableAdBlockerDetection","_carbonads","_bsa","redirectOnClick","widgets.outbrain.com","div","Werbeblocker","/googletagmanager|ip-api/","&&","()=>j(e=>e-1)","timeleftlink","handlePopup","bannerad sidebar ti_sidebar","moneyDetect","play","EFFECTIVE_APPS_GCB_BLOCKED_MESSAGE","sub","checkForAdBlocker","/createElement|addEventListener|clientHeight/","uberad_mode",".php","!notunmovie","handleRedirect","testAd","imasdk.googleapis.com","/topaz/api","data.availableProductCount","results.[-].advertisement","/partners/home","__aab_init","show_videoad_limited","__NATIVEADS_CANARY__","[breakId]","_VMAP_","DMP_ENABLE_ADS","ad_slot_recs","/doc-page/recommenders","Object.prototype.adOnAdBlockPreventPlayback","pre_roll_url","post_roll_url","/adsbygoogle|dispatchEvent/","OfferwallSessionTracker","player.preroll",".redirected","promos","TNCMS.DMP","/pop?","=>","link.click","document.body.style.overflow","fallback","!addons.mozilla.org","/await|clientHeight/","Function","Yii2App.playbackTimeout",".ad-slot","!/\\/download|\\/play|cdn\\.videy\\.co/","!_self","#fab","www/delivery","/\\/js/","/\\/4\\//","prads","/googlesyndication|doubleclick|adsterra/",".adsbygoogle","/googlesyndication\\.com|offsetHeight/","..searchResults.*[?.isAd==true]","..mainContentComponentsListProps.*[?.isAd==true]","/search/snippet?","/Werbeblocker|refresh\\\\/","cwAdblockDisabled","cmgpbjs","displayAdblockOverlay","start_full_screen_without_ad","drupalSettings.coolmath.hide_preroll_ads",".submit","pbjs.libLoaded","flashvars.adv_pre_url","()&&","Object.prototype.adBlockerPop","BACK","RLCONF.wgAdShieldActive","wgAffiliateEnabled","!/^https:\\/\\/sendvid\\.com\\/[0-9a-z]+$/","vglnk","adNotificationDetected","adsbytrafficjunkycontext","abp1","clkUnder","adsArr","data.getFinalClickoutUrl data.sendSraBid","data.getAd","onClick","adRendered","steamBanner clickAds clickAdsUa clickAdsRu pushNotification","!storiesig","openUp",".result.timeline.*[?.type==\"ad\"]","/livestitch","protectsubrev.com","dispatchEvent(window.catchdo)","En(e-1)","!adShown","3200-","imageProbe","Promise.all","AdProvider","AdProvider.push","ads_","adClickThrough","ad_blocker_detector","._$",".result.items.*[?.content*=\"'+'\"]","/comments","img[onerror]","localStorage[","KAA.state.revspot","KAA.state.popads","/popMagic|shield/","enforceVideoShield","startOrchestrator","/initPops|popLite|popunder/","__US_CONFIG__.ads.adblock_measure_enabled","__US_CONFIG__.ads.adblock_wall_enabled","__US_CONFIG__.ads.urls","messages.*.ads messages.*.renderedAdsHtml","shouldRun","ad-ipd","smartclip","window.getComputedStyle","maddenwiped","/redirect.php?","*.*","/api/banners","checkBanners","__SSR_CONFIG__.monkey","__revCatchInitialized","ab.dt","data.initPlaybackSession.adScenarios data.initPlaybackSession.adExperience.adExperienceTypes","Object.prototype.adblockPlugin","initializeNtvxSheet","fireAd","juicy_tags","!youtu","injectAd","resumeGame","/admaven|adspyglass/","__tcfapi","ezRewardedAds.requestAndShow","timeout","__ahaEzoicLoaderError","__ahaEzoicInjectedAt",".value--","/eeea5e31|new\\s+Function/","timeLeft--","source.ads","/player","adsterraSmartLink adsterraSmartLink2","/access","/popup/i","length:1000-1010","/_0x|window\\.open/","Advert","popup-dialog-id","utilAds","/ADBLOCK|ADSENSE/","sponsor ad_provider","api.openlua.cloud","script-error","Element.prototype.remove","probe","HTMLElement.prototype.remove","/adsbygoogle|google-analytics|ads-twitter|doubleclick/","=void 0","/\\{[a-z]+\\(\\)\\}/",".value||",".value&&","gsmAccessGate","bf-ad.net","protect","poseidonAdBootstrap.freestarReady","cue_points","/playback","data.promotions","__kbAdBait","OzB.adb","/offsetHeight|getComputedStyle/","Object.prototype.special","foxizParams.adDetectorMethod","()=>e()","sponsored_ads","tag.min.js","..playGateQueue","playerHeadScriptSnippets","/api/config","shaman",".stories.*[?.storyType==\"ad\"]","cykloStories","innerHTML.length:0","isBlocked","/adblock|Error|getComputedStyle/","/click|pointerup/","handleUserAction",".bannerConfig..advertise.*","client=ca-pub-",".pub-slot-wrapper","top","0px","Period:has(> EventStream[schemeIdUri=\"urn:sva:advertising-wg:ad-id-signaling\"])","/dash",".showModal","triggerPopunder","/getComputedStyle|offsetHeight/","ads-prebid",".data.*[?.hasAd==true]","/card/fill","just-detect-adblock","thistextshouldbethere","enforce","highperformanceformat","/^function\\([a-z]\\)\\{[a-z]\\([a-z]\\)\\}$|!1/","/bait|AdBlock/i","adb_failed","VVADS","FVPOA","googletag.setConfig","data.advanced_settings","adblock_probe","dataset.namikoVisitProbe='ready'","/timed out|\\?\\?=/","length:10001","*.props.videoPlayerAds *.props.postButtonAds","popupAdModal","/click|load/","/document\\.location|pop\\.|exo|cookie|\\.php/","/ok_|pemsrv\\.com|window\\.location\\.href/","doAdRedirect","%22vt%22","checkJuicyPopBlocked","google_tag_manager","/offsetHeight|error\"/","fullscreenEnabled","beforeunload","/[Ww]orker/","mousemove","loadSecret",".onerror","String.prototype.toLowerCase","Contract","new","/bxslider|wow/","tigervip2","new Function(atob(","WebSocket","event.data","/wp-content","executeCode","isWin","data.*.elements.edges.[].node.outboundLink","data.children.[].data.outbound_link","method:POST url:/logImpressions","rwt",".js","_oEa","ADMITAD","body:browser","_hjSettings","/07c225f3\\.online|content-loader\\.com|css-load\\.com|html-load\\.com/","bmak.js_post","method:POST","utreon.com/pl/api/event method:POST","log-sdk.ksapisrv.com/rest/wd/common/log/collect method:POST","firebase.analytics","require.0.3.0.__bbox.define.[].2.is_linkshim_supported","/(ping|score)Url","Object.prototype.updateModifiedCommerceUrl","/\\/api\\/stats\\/atr\\?.+?&rt=\\d+\\.\\d+.+?&volume=\\d+&cbr=.+?&fexp=v1%[-%0-9C]{300,}&.+?&muted=\\d(&vis=3)?&docid=/ method:POST","fingerprintjs-pro-react","flashvars.event_reporting","dataLayer.trackingId user.trackingId","Object.prototype.has_opted_out_tracking","cX_atfr","process","process.env","/VisitorAPI|AppMeasurement/","Visitor","analytics/bulk-pixel","eventing","send_gravity_event","send_recommendation_event","window.screen.height","method:POST body:zaraz","onclick|oncontextmenu|onmouseover","a[href][onclick*=\"this.href\"]","cmp.inmobi.com/geoip","method:POST url:pfanalytics.bentasker.co.uk","discord.com/api/v9/science","a[onclick=\"fire_download_click_tracking();\"]","adthrive._components.start","method:POST body:/content_view|impression|page_view/",".*[?.operationName==\"TrackEvent\"]","/v1/api","ftr__startScriptLoad","url:/undefined method:POST","linkfire.tracking","method:POST body:/pageview|engagement/","body:pageview method:POST","svc.webex.com/metrics","/api/1.1/flow/viewer.json","/api/1.1/flow/timeline.json","{\"skipToString\":true}","/api/1.1/graphql/viewer_context.json","faro.civitai.com","method:POST body:/\"track\"|adblock/","method:POST body:tracker","$[?.operationName==\"sendExperimentMeasurementReferences\"].*","AppLogBridge.hasStarted","AppLogBridge.onEventV3","AppLogBridge.profileSet","AppLogBridge.profileSetOnce","AppLogBridge.profileIncrement","AppLogBridge.profileUnset","AppLogBridge.profileAppend","miner","CoinNebula","blogherads","Math.sqrt","update","/(trace|beacon)\\.qq\\.com/","splunkcloud.com/services/collector","event-router.olympics.com","hostingcloud.racing","tvid.in/log/","excess.duolingo.com/batch","/eventLog.ajax","t.wayfair.com/b.php?","navigator.sendBeacon","segment.io","mparticle.com","ceros.com/a?data","pluto.smallpdf.com","method:/post/i url:/\\/\\/chatgpt\\.com\\/ces\\/v1\\/[a-z]$/","method:/post/i url:ab.chatgpt.com/v1/rgstr","/eventhub\\.\\w+\\.miro\\.com\\/api\\/stream/","logs.netflix.com","s73cloud.com/metrics/","igniteseurope.com/stats/","_startBeaconSending","litix.io","/hpyjmp|marzaent/","brightline.tv","_grx","17000","adPlacements adSlots playerResponse.adPlacements playerResponse.adSlots [].playerResponse.adPlacements [].playerResponse.adSlots","/\\/player(\\?|$)/","adPlacements adSlots playerResponse.adPlacements playerResponse.adSlots","endpoint.watchEndpoint.unserializedPrefetchData.playerResponse.playerAds endpoint.watchEndpoint.unserializedPrefetchData.playerResponse.adPlacements endpoint.watchEndpoint.unserializedPrefetchData.playerResponse.adSlots","/resolve_url?","/\\/player(?:\\?.+)?$/","require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.viewer.sideFeedUnit.nodes.[].new_adverts.nodes.[-].sponsored_data","data.viewer.sideFeedUnit.nodes.[].new_adverts.nodes.[-].sponsored_data","..data.viewer..nodes.*[?.__typename==\"AdsSideFeedUnit\"]","require.0.3.0.__bbox.require.[].3.1.__bbox.result.data.serpResponse.results.edges.[-].rendering_strategy.view_model.story.sponsored_data.ad_id","..nodes.*[?.sponsored_data]",".data[?.category==\"SPONSORED\"].node","..node[?.*.__typename==\"SponsoredData\"]",".data.viewer.news_feed.edges.*[?.category==\"SPONSORED\"].node","/vast.php?","/click\\.com|preroll|native_render\\.js|acscdn/","]();}","/^\\s*function\\s*\\(\\s*\\)\\s*{\\s*[a-zA-Z]{1,2}\\s*\\(.{1,10}$/","/bjwywsj|bhhsywi|caoampzpue|2147|00z0oq|qrqwrruqwwtz|kA_z3az21|trwqqkzka1c2|oon\\=\\\"cy|zaz,ee/","/function\\(\\)\\s*\\{\\s*var .{70,300}\\s*\\)\\s*\\}\\s*$/","4000-6000","console[","parseInt(localStorage['\\x","(new Error(","/fd/ls/lsp.aspx","scriptBlocked","blocked","testUrls","Handlers","Settings","initializeAdblockDetection","detection-bait",".offsetHeight>0","/^https:\\/\\/pagead2\\.googlesyndication\\.com\\/pagead\\/js\\/adsbygoogle\\.js\\?client=ca-pub-3497863494706299$/","data-instype","ins.adsbygoogle:has(> div#aswift_0_host)","url:https://googleads.g.doubleclick.net/pagead/ads?client=ca-pub-3497863494706299 method:HEAD mode:no-cors","throttle","121","Worker.prototype.postMessage","4000-","/lovelylovely|veryveryplease|click\\(\\)|MouseEvent|dispatchEvent/","g.doubleclick.net","length:100000","favicon","length:252","summerday","/offsetHeight|loaded/","pagead2.googlesyndication.com/pagead/js/adsbygoogle.js method:HEAD","emptyStr","showFallbackModal","Object.prototype.hasRightPartnership","Object.prototype.hasLeftPartnership","Object.prototype.hasTopPartnership","Object.prototype.hasBottomPartnership","security.js","div[class][style*=\"2147483647\"]","document.adoptedStyleSheets","OffscreenCanvas.prototype.getContext","Image","Element.prototype.removeChild","/blocked|tick/","/unknown|BLOCKED/i","/\\?abg=|adsbygoogle|tpc\\.googlesyndication\\.com|doubleclick\\.net|googleadservices\\.com/","Keen","stream.insertion","/video/auth/media","akamaiDisableServerIpLookup","MONETIZER101.init","/outboundLink/","Object.prototype.adService.initialize","DD_RUM.addAction","nads.createAd","t++","dvtag.getTargeting","class|style","div[id^=\"los40_gpt\"]","huecosPBS.nstdX","config.globalInteractions.[].bsData","DTM.trackAsyncPV","_satellite","_satellite.getVisitorId","mobileanalytics","pp_adblock_is_off","newPageViewSpeedtest","pubg.unload","generateGalleryAd","mediator","Object.prototype.subscribe","gbTracker","gbTracker.sendAutoSearchEvent","Object.prototype.vjsPlayer.ads","marmalade","url:ipapi.co","isPeriodic","data-woman-ex","a[href][data-woman-ex]","data-trm-action|data-trm-category|data-trm-label",".trm_event","KeenTracking","network_user_id","cloudflare.com/cdn-cgi/trace","History","/(^(?!.*(Function|HTMLDocument).*))/","api","googletag.cmd","skipAdSeconds","/recommendations.","_aps","/api/analytics","Object.prototype.setDisableFlashAds","DD_RUM.addTiming","chameleonVideo.adDisabledRequested","AdmostClient","datalayer","Object.prototype.isInitialLoadDisabled","lr-ingest.io","listingGoogleEETracking","dcsMultiTrack","urlStrArray","Object.prototype.setConfigurations","/gtm.js","JadIds","Object.prototype.bk_addPageCtx","Object.prototype.bk_doJSTag","passFingerPrint","optimizely","optimizely.initialized","google_optimize","google_optimize.get","_gsq","_gsq.push","_gsDevice","Object.prototype.renderDirect):matches-path(/\\/(?:weather\\/|pogoda\\/|hava\\/)/","iom","iom.c","_conv_q","_conv_q.push","pa.privacy","populateClientData4RBA","YT.ImaManager","UOLPD","UOLPD.dataLayer","__configuredDFPTags","URL_VAST_YOUTUBE","Adman","dplus","dplus.track","_satellite.track","/EzoIvent|TDELAY/","google.ima.dai","/froloa.js","gfkS2sExtension","gfkS2sExtension.HTML5VODExtension","/event_callback=function\\(\\){window\\.location=t\\.getAttribute\\(\"href\"\\)/","AnalyticsEventTrackingJS","AnalyticsEventTrackingJS.addToBasket","AnalyticsEventTrackingJS.trackErrorMessage","initializeslideshow","b()","fathom","fathom.trackGoal","Origami","Origami.fastclick","jad","hasAdblocker","Sentry","Sentry.init","TRC","TRC._taboolaClone","fp","fp.t","fp.s","initializeNewRelic","turnerAnalyticsObj","turnerAnalyticsObj.setVideoObject4AnalyticsProperty","turnerAnalyticsObj.getVideoObject4AnalyticsProperty","optimizelyDatafile","optimizelyDatafile.featureFlags","fingerprint","fingerprint.getCookie","gform.utils","gform.utils.trigger","get_fingerprint","moatPrebidApi","moatPrebidApi.getMoatTargetingForPage","readyPromise","cpd_configdata","cpd_configdata.url","yieldlove_cmd","yieldlove_cmd.push","dataLayer.push","1.1.1.1/cdn-cgi/trace","_etmc","_etmc.push","freshpaint","freshpaint.track","ShowRewards","stLight","stLight.options","DD_RUM.addError","sensorsDataAnalytic201505.init","sensorsDataAnalytic201505.quick","sensorsDataAnalytic201505.track","s","s.tl","taboola timeout","clearInterval(run)","smartech","/TDELAY|EzoIvent/","sensors","sensors.init","/piwik-","2200","2300","sensors.track","googleFC","adn.clearDivs","_vwo_code","live.streamtheworld.com/partnerIds","_taboola","_taboola.push","clicky","clicky.goal","WURFL","_sp_.config.events.onSPPMObjectReady","gtm","gtm.trackEvent","mParticle.Identity.getCurrentUser","JSGlobals.prebidEnabled","i||(e(),i=!0)","elasticApm","elasticApm.init","ga.sendGaEvent","ads.viralize.tv","adobe","MT","MT.track","ClickOmniPartner","adex","adex.getAdexUser","Adkit","Object.prototype.shouldExpectGoogleCMP","apntag.refresh","pa.sendEvent","Munchkin","Munchkin.init","ttd_dom_ready","ramp","appInfo.snowplow.trackSelfDescribingEvent","_vwo_code.init","adobePageView","adobeSearchBox",".dropdown-menu a[href]","dapTracker","dapTracker.track","newrelic","newrelic.setCustomAttribute","adobeDataLayer","adobeDataLayer.push","utag","utag.link","_satellite.kpCustomEvent","Object.prototype.disablecommercials","Object.prototype._autoPlayOnlyWithPrerollAd","Sentry.addBreadcrumb","freestar.newAdSlots","String.prototype.allReplace","executaGoogleAnalytics3","initJWPlayerMux","initJWPlayerMux.utils","initJWPlayerMux.utils.now","ambossAnalytics","ambossAnalytics.getUserAttribution","dataset.ready","script[src^=\"https://www.googletagmanager.com/gtag/js?id=\"]","Osano","Osano.cm","Osano.cm.addEventListener","Osano.cm.removeEventListener","pa.getVisitorId","RISKX","RISKX.go","RISKX.setSid","Sentry.configureScope","baMet.register","Object.prototype.componentInScreen","smetrics.bankofamerica.com","_uxa","_uxa.push","Sentry.onLoad","ncbi.sg","ncbi.sg.ping","OfflineAudioContext","navigator.bluetooth","sendClickEvent","triggerAdBlockModal","SPM_CONFIG.adblockOnly","checkAdScript","](getComputedStyle,","Object.Score","isAdblocked","/bait\\.offsetHeight===0|isAdblocked|requestAnimationFrame\\(|AdBlock|AdGuard/","offsetHeight === 0","ad_id_for_555","all520dddaaa2022ccc",".offsetHeight == 0","/DOMContentLoaded|load|complete/","/check|detected/","_AdBlockInit","/googlesyndication\\.com|doubleclick\\.net/","offsetHeig\\'+\\'ht\\']","/api/ads","alertadmodal","float_right > div","/getexoloader/","pagead","www3.doubleclick.net","adblock_tip","AD_SURVEY_Add_AdPos","AD_SURVEY_Add_AdPos_Simple","/\\.height\\(\\) == 0|adsbygoogle/","myModal","loadErrorTip","ins.adsbygoogle","isAdsDisplayed","event.target.tagName","fuzqingAdPlus","Ad Block","all520dddaaa2022aaa","typeof(ad)","\\u","document.writeln","发现严重BUG","checker","/pagead2\\.googlesyndication\\.com|\\/fbevents\\.js/","google.ima.AdError","/#myModal'\\)\\.modal/","google_empty_script_included","COOKIE_NAME","ADS_BLOCKED","adskilltest","/home/?adblock=","/!document\\.getElementById\\([\\s\\S]*?\\.style\\.display=/","showRemoveAdBlocker","Object.prototype.cnobpreroll_","Object.prototype.canobpreroll_","ad_num_show","!document.getElementById(btoa","daau_app","__jsadsuccess","__DOMAIN","adbk","/ad block stop|warm_msg/","config.group","preBid","preBid.displayAd","preBid.getPrerollVASTUrl","adStart","player.VastADPlugin","ADSOBJET","Object.prototype.pgmp","invokeInterstitial","Object.prototype.ShouldLoadAds","delCookie","injectPops","myPlayer.adDisplay","NEWS_FEED","infoid","document.write(ad);","conone_lmg","adCountDown",".s--","Object.prototype.ad_switch","dy_card_dyrun","/bit\\.ly|kbtv/","video-ad-timeout","tips","poped","adFeedbackData adType adServedUrls","list.*.link.ad list.*.link.kicker","configs.*.properties.slideshowWCSettings.interstitialNativeAds configs.*.properties.fullScreenSlideshowSettings.interstitialNativeAds properties.componentConfigs.slideshowConfigs.interstitialNativeAds properties.componentConfigs.slideshowConfigs.slideshowSettings.interstitialNativeAds","Object.prototype.adData","Object.prototype._adData","qciss.net","akumtagcc","myclick","/getCookie[\\s\\S]*?\\(\"\\\\x/","MM_openBrWindow","/\\.(gif|php)/","window.leave","CloseAd","lists","timerAdCountdown","88p2p.com","is_show","data.item data.ads","Object.prototype.getAd","getAd","mount_adsqrt_ad","new Function","player.adList","showAd","DPLAYER_PREROLL_AD.attachPreRollAd","sponsored",".map(function","/<script src=.*Math\\.floor\\(Date\\.now\\(\\)/","adbyunion","data.*.list.[-].resourceData.adData","visitUrl","adRender","addImageAd","loadAd","createFixedBottomBannerWithClose","/deposit-bonus?platform=26&utm_source=","mmPopup() {","_mtj","try{e()}catch(e){if(t[e.message])return;",".current=setTimeout","position:","allData.safeLevel","ecjkox.com","ads_codes","touchend","!/external","adUI","appData","topData","midData","btmData","coupletData","data-ads_url","[data-ads_url]","parentNode.insertBefore","return a.split","adModal","adInfo","isAdLoaded","Object.prototype.noAD","__PROXY_META","__ad_unblock_id_obfuscation","/getCookie|checkCK|checkCookie|checkC00kie|checkCoookie|checkCookiiiie|document\\.cookie|buttonClose|exptime/","infoList","data.CardList.[].children_list.ad_list data.CardList.[-].params.advertiser_name","pageProps.adSystem props.pageProps.adSystem","__NEXT_DATA__.props.pageProps.adSystem","addEventListener(\"touchstart\"","adObj","clientheight","/(?=^(?![\\s\\S]*(static|jquery)))/","data.[-].ad.adScene items.*.video.*.data.[-].ad.adScene data.template.tabs.*.blocks.*.data.data.*.videos.feature_ad data.template.tabs.*.blocks.*.data.data.videos.*.ad","#banner[style*=\"background-image:url\"]","CreativePlayerwebPlugin.AD_EVENT.AD_DESTROY","CreativePlayerwebPlugin.AD_EVENT.AD_LOAD_START","data.cm_info.ads","pageData.__banners.0.commercial.mediaUrl","pageData.__banners.0.commercial.jumpUrl","pageData.__banners.0.commercial.title","pageData.__banners.1.commercial.mediaUrl","pageData.__banners.1.commercial.jumpUrl","pageData.__banners.1.commercial.title","detailParams.is_ad_play","entity.commercial","new Function(document["];
    const { functionRefs } = scriptletGlobals;
    for ( const ref of todo ) {
        if ( ref < 0 ) { continue; }
        if ( todo.has(~ref) ) { continue; }
        const arglist = JSON.parse(`[${arglists[ref]}]`);
        const fn = functionRefs[arglist[0]];
        try { fn(...arglist.slice(1).map(a => args[a])); }
        catch { }
    }
}

/******************************************************************************/

// End of local scope
})("formant_ubo_static_fallback");

void 0;

/*******************************************************************************

    uBlock Origin Lite - a comprehensive, MV3-compliant content blocker
    Copyright (C) 2014-present Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock

*/

// Important!
// Isolate from global scope

// Start of local scope
(function uBOL_scriptletFrameworkEnd($SECRET_ID$) {

/******************************************************************************/

const scriptletGlobals = self[$SECRET_ID$];
delete self[$SECRET_ID$];
scriptletGlobals.origins = undefined;
scriptletGlobals.functionRefs = undefined

/******************************************************************************/

// End of local scope
})("formant_ubo_static_fallback");

void 0;
