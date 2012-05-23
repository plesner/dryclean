function renderJson(root, obj) {
  if (Array.isArray(obj)) {
    var list = document.createElement("ol");
    root.appendChild(list);
    obj.forEach(function (elm) {
      var item = document.createElement("li");
      list.appendChild(item);
      renderJson(item, elm);
    });
  } else if (typeof obj == "object") {
    var list = document.createElement("ul")
    root.appendChild(list);
    Map.wrap(obj).forEach(function (key, value) {
      var item = document.createElement("li");
      list.appendChild(item);
      var span = document.createElement("span");
      item.appendChild(span);
      span.style.fontWeight = "bold";
      renderJson(span, key);
      renderJson(item, " = ");
      renderJson(item, value);
    });
  } else {
    root.appendChild(document.createTextNode(obj));
  }
}

function handleMessage(message) {
  renderJson(document.body, message);
}

function onLoad() {
  var browser = getBrowserController();
  browser.sendRequest("getAlerts")
    .onFulfilled(handleMessage)
    .onFailed(browser.getLogCallback());
}
