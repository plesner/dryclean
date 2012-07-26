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

HistoryEntry.prototype.display = function (builder) {
  var referer = Url.parse(this.referer);
  var name = referer.getFileName();
  if (name == null) {
    name = referer.getDomain();
  } else {
    name = "(" + referer.getBaseDomain() + ") " + name;
  }
  if (name.length > 32)
    name = name.slice(0, 32) + "...";
  builder
    .begin("li")
      .appendText(formatDate(this.timestamp) + ": ")
      .begin("a")
        .setAttribute("href", this.referer)
        .setAttribute("title", this.referer)
        .setAttribute("target", "_blank")
        .appendText(name)
      .end()
    .end();
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

CookieInfo.prototype.getSeverity = function () {
  return this.severity;
};

/**
 * A collection of alerts belonging to a particular domain base.
 */
function AlertInfo(ignored, baseName, cookies) {
  this.ignored = ignored;
  this.baseName = baseName;
  this.cookies = cookies.map(function (cookie) { return new CookieInfo(cookie); });
  this.primaryCookieCache = null;
  this.openSettings = null;
  this.containerNode = null;
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

AlertInfo.prototype.getSeverity = function () {
  if (this.isIgnored()) {
    return displayInPopupSeverity;
  } else {
    return this.getPrimaryCookie().getSeverity();
  }
};

/**
 * Is this alert explicitly ignored?
 */
AlertInfo.prototype.isIgnored = function () {
  return !!this.ignored.get(this.baseName);
};

/**
 * Displays this information in the DOM using the specified root as the parent.
 */
AlertInfo.prototype.display = function (builder) {
  var isIgnored = this.isIgnored();
  var primary = this.getPrimaryCookie();
  var severityColor = getSeverityColor(primary.severity);
  var rootNode;
  var containerNode;
  builder
    .delegate(function (_, node) { rootNode = node; })
    .begin("div")
      .delegate(function (_, node) { containerNode = node; })
      .addClass(isIgnored ? "alert ignored" : "alert")
      .addEventListener("click", this.onClick.bind(this, rootNode))
      .begin("div")
        .begin("span")
          .addClass("domain")
          .appendText(this.baseName)
        .end("span")
        .begin("span")
          .addClass("domainStats")
          .appendText(" (sites: ")
          .appendText(primary.getSourceCount())
          .appendText(", history: ")
          .appendText(primary.getHistoryLength())
          .appendText(")")
        .end("span")
      .end()
      .begin("div")
        .addClass("sources")
        .begin("span")
          .addClass("label")
          .appendText("Sites tracked: ")
        .end()
        .forEach(primary.baseDomainsSeen, function (source, builder, index) {
          builder
            .appendText(index == 0 ? "" : ", ")
            .begin("span")
              .addClass("source")
              .appendText(source)
            .end();
        })
        .appendText(".")
      .end()
      .begin("div")
        .addClass("severity")
        .setStyle("background", severityColor)
        .setStyle("borderLeft", "1px solid " + severityColor.darker(.1))
      .end()
    .end();
  this.containerNode = containerNode;
};

/**
 * Controller for the settings box for an alert.
 */
function AlertSettings(root, info) {
  this.root = root;
  this.info = info;
  this.element = null;
}

AlertSettings.prototype.close = function () {
  this.root.removeChild(this.element);
};

AlertSettings.prototype.open = function () {
  var element;
  var checker;
  DomBuilder.attach(this.root)
    .begin("div")
      .addClass("settings")
      .delegate(function (_, node) { element = node; })
      .begin("input")
        .addClass("checker")
        .setAttribute("type", "checkbox")
        .setAttribute("checked", this.info.isIgnored())
        .delegate(function (_, node) { checker = node; })
      .end()
      .appendText("Ignore all cookies from ")
      .begin("b")
        .appendText(this.info.baseName)
      .end()
      .appendText(".")
    .end();
  this.element = element;
  checker.addEventListener("change", this.onChanged.bind(this));
};

/**
 * Calles when the check box is clicked.
 */
AlertSettings.prototype.onChanged = function (event) {
  var checked = event.srcElement.checked;
  this.info.ignored.put(this.info.baseName, checked);
  var builder = DomBuilder.attach(this.info.containerNode);
  if (checked) {
    builder.addClass("ignored");
  } else {
    builder.removeClass("ignored");
  }
};

AlertInfo.prototype.onClick = function (root, event) {
  if (this.openSettings) {
    this.openSettings.close();
    this.openSettings = null;
  } else {
    this.openSettings = new AlertSettings(root, this);
    this.openSettings.open();
  }
};

/**
 * Information about all active alerts.
 */
function AlertCollection(ignored, json) {
  this.baseNames = Map.wrap(json.baseNames).map(function (cookies, baseName) {
    return new AlertInfo(ignored, baseName, cookies);
  });
  this.alertsToDisplay = null;
}

/**
 * Are there any alerts to display?
 */
AlertCollection.prototype.isEmpty = function () {
  return this.getAlertsToDisplay().length == 0;
}

/**
 * Returns a list of the alerts to display, sorted by severity.
 */
AlertCollection.prototype.getAlertsToDisplay = function () {
  if (!this.alertsToDisplay) {
    var sortedAlerts = [];
    this.baseNames.forEach(function (name, alert) {
      if (alert.getSeverity() >= displayInPopupSeverity)
        sortedAlerts.push(alert);
    });
    sortedAlerts.sort(function (alertA, alertB) {
      return alertB.getSeverity() - alertA.getSeverity();
    });
    this.alertsToDisplay = sortedAlerts;
  }
  return this.alertsToDisplay;
};

/**
 * Updates the DOM to display information about this set of alerts.
 */
AlertCollection.prototype.display = function (builder) {
  builder
    .clearChildren()
    .forEach(this.getAlertsToDisplay(), function (alert, builder) {
      builder
        .begin("div")
          .delegate(alert.display.bind(alert))
        .end();
    });
};

/**
 * Handles messages from the badge.
 */
function displayAlerts(ignored, message) {
  var alerts = new AlertCollection(ignored, message.state);
  if (alerts.isEmpty()) {
    var empty = document.getElementById("empty");
    empty.style.display = null;
  } else {
    var main = document.getElementById("main");
    main.style.display = null;
    alerts.display(DomBuilder.attach(main));
  }
}

function onLoad() {
  var ignored = MapStorage.create("ignored");
  var browser = getBrowserController();
  browser.sendRequest("getAlerts")
    .onFulfilled(displayAlerts.bind(displayAlerts, ignored))
    .onFailed(browser.getLogCallback());
}
