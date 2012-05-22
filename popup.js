/**
 * Information about a single cookie.
 */
function CookieInfo(json) {
  this.cookie = json.cookie;
  this.history = json.history;
  this.sources = json.sources;
  this.sources.sort();
}

CookieInfo.prototype.getHistoryLength = function () {
  return this.history.length;
};

CookieInfo.prototype.getSourceCount = function () {
  return this.sources.length;
};

/**
 * A collection of alerts belonging to a particular domain base.
 */
function AlertInfo(baseName, cookies) {
  this.baseName = baseName;
  this.cookies = cookies.map(function (cookie) { return new CookieInfo(cookie); });
  this.primaryCookieCache = null;
}

/**
 * Returns the unique cookie we'll show information about in the popup.
 */
AlertInfo.prototype.getPrimaryCookie = function () {
  if (this.primaryCookieCache)
    return this.primaryCookieCache;
  var maxHistory = -1;
  var primaryCookie = null;
  this.cookies.forEach(function (cookie) {
    var length = cookie.getHistoryLength();
    if (length > maxHistory) {
      maxHistory = cookie.getHistoryLength();
      primaryCookie = cookie;
    }
  });
  return this.primaryCookieCache = primaryCookie;
};

/**
 * Displays this information in the DOM using the specified root as the parent.
 */
AlertInfo.prototype.display = function (root) {
  var domain = document.createElement("div");
  domain.className = "domain";
  var primary = this.getPrimaryCookie();
  domain.innerText = this.baseName + " (sites: " + primary.getSourceCount() + ", history:" + primary.getHistoryLength() + ")";
  root.appendChild(domain);
  var sources = document.createElement("div");
  sources.className = "sources";
  var sentFrom = document.createElement("span");
  sentFrom.innerText = "Sent from ";
  sentFrom.className = "label";
  sources.appendChild(sentFrom);
  var first = true;
  primary.sources.forEach(function (source) {
    if (first) {
      first = false;
    } else {
      sources.appendChild(document.createTextNode(", "));
    }
    var sourceSpan = document.createElement("span");
    sourceSpan.className = "source";
    sourceSpan.innerText = source;
    sources.appendChild(sourceSpan);
  });
  sources.appendChild(document.createTextNode("."));
  root.appendChild(sources);
};

/**
 * Information about all active alerts.
 */
function AlertCollection(json) {
  this.baseNames = Map.wrap(json.baseNames).map(function (cookies, baseName) {
    return new AlertInfo(baseName, cookies);
  });
}

/**
 * Updates the DOM to display information about this set of alerts.
 */
AlertCollection.prototype.updateDisplay = function (root) {
  // First clean out previous child nodes, just in case.
  while (root.hasChildNodes())
    root.removeChild(root.firstChild);
  // Then add an entry for each base name.
  var sortedNames = this.baseNames.keys();
  sortedNames.sort(function (a, b) {
    var aCookie = this.baseNames.get(a).getPrimaryCookie();
    var bCookie = this.baseNames.get(b).getPrimaryCookie();
    var sourceDiff = bCookie.getSourceCount() - aCookie.getSourceCount();
    if (sourceDiff != 0)
      return sourceDiff;
    return bCookie.getHistoryLength() - aCookie.getHistoryLength();
  }.bind(this));
  sortedNames.forEach(function (baseName) {
    var alertInfo = this.baseNames.get(baseName);
    var div = document.createElement("div");
    div.className = "alert";
    alertInfo.display(div);
    root.appendChild(div);
  }.bind(this));
};

/**
 * Handles messages from the badge.
 */
function handleMessage(message) {
  var alerts = new AlertCollection(message.state);
  alerts.updateDisplay(document.getElementById("main"));
}

function onLoad() {
  // Open a connection to the badge and wait for it to call back with an
  // update.
  var port = chrome.extension.connect({name: "dryclean.popup"});
  port.onMessage.addListener(function (message) {
    handleMessage(message);
  });
}
