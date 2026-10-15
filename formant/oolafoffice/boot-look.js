try {
  var d = document.documentElement;
  var l = localStorage.getItem("oolafoffice.look") || localStorage.getItem("vibeoffice.look") || "classic";
  d.dataset.look = l;
  d.dataset.layout = l === "paper2016" ? "ribbon" : "bars";
} catch (e) {
  /* storage off: classic look */
}
