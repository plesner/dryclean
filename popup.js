function HistoryEntry(json) {
  this.target = json.target;
  this.referer = json.referer;
  this.timestamp = json.timestamp;
}

function formatDate(timestamp) {
  function toDigits(value) {
    if (value < 10) {
      return "0" + value;
    } else {
      return String(value);
    }
  }
  var date = new Date(timestamp);
  return toDigits(date.getHours()) + ":" + 
         toDigits(date.getMinutes());
}

HistoryEntry.prototype.display = function (root) {
  var referer = Url.parse(this.referer);
  var item = document.createElement("li");
  root.appendChild(item);
  item.appendChild(document.createTextNode(formatDate(this.timestamp) + ": "));
  var name = referer.getFileName();
  if (name == null) {
    name = referer.getDomain();
  } else {
    name = "(" + referer.getBaseDomain() + ") " + name;
  }
  if (name.length > 32)
    name = name.slice(0, 32) + "...";
  var link = document.createElement("a");
  item.appendChild(link);
  link.href = this.referer;
  link.title = this.referer;
  link.appendChild(document.createTextNode(name));
};

/**
 * Information about a single cookie.
 */
function CookieInfo(json) {
  this.cookie = json.cookie;
  this.history = json.history.map(function (entry) { return new HistoryEntry(entry); });
  this.baseNamesSeen = json.baseNamesSeen;
  this.baseNamesSeen.sort();
  this.baseDomainsSeen = json.baseDomainsSeen;
  this.baseDomainsSeen.sort();
  this.severity = json.severity;
}

CookieInfo.prototype.getHistoryLength = function () {
  return this.history.length;
};

CookieInfo.prototype.getSourceCount = function () {
  return this.baseNamesSeen.length;
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
  root.addEventListener('click', this.onClick.bind(this, root));
  var domain = document.createElement("div");
  domain.className = "domain";
  var primary = this.getPrimaryCookie();
  var severity = document.createElement("div");
  root.appendChild(severity);
  severity.className = "severity";
  var color = RGB.between(RGB.LOW, primary.severity, RGB.HIGH);
  severity.style.background = color;
  severity.style.borderLeft = "1px solid " + color.darker(.1);
  domain.innerText = this.baseName + " (sites: " + primary.getSourceCount() + ", history:" + primary.getHistoryLength() + ")";
  root.appendChild(domain);
  var sources = document.createElement("div");
  sources.className = "sources";
  var sentFrom = document.createElement("span");
  sentFrom.innerText = "Sent from ";
  sentFrom.className = "label";
  sources.appendChild(sentFrom);
  var first = true;
  primary.baseDomainsSeen.forEach(function (source) {
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

AlertInfo.prototype.onClick = function (root, event) {
  var history = document.createElement("ul");
  root.appendChild(history);
  var primary = this.getPrimaryCookie();
  primary.history.forEach(function (entry) {
    entry.display(history);
  });
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
 * Does this collection hold any alerts?
 */
AlertCollection.prototype.isEmpty = function () {
  return this.baseNames.getSize() == 0;
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
function displayAlerts(message) {
  var alerts = new AlertCollection(message.state);
  if (alerts.isEmpty()) {
  var empty = document.getElementById("empty");
    empty.style.display = null;
  } else {
    var main = document.getElementById("main");
    main.style.display = null;
    alerts.updateDisplay(main);
  }
}

function onLoad() {
  var browser = getBrowserController();
  browser.sendRequest("getAlerts")
    .onFulfilled(displayAlerts)
    .onFailed(browser.getLogCallback());
}
