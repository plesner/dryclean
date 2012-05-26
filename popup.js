/**
 * Really quick and dirty dom construction framework.
 */
function DomBuilder(parent) {
  this.stack = [parent];
  this.current = parent;
}

/**
 * Returns a new dom builder that attaches to the given parent.
 */
DomBuilder.attach = function (parent) {
  return new DomBuilder(parent);
}

/**
 * Begins a new element with the given tag name, attaching it to the current
 * element.
 */
DomBuilder.prototype.begin = function (tagName) {
  var elm = document.createElement(tagName);
  this.current.appendChild(elm);
  this.stack.push(elm);
  this.current = elm;
  return this;
};

/**
 * Removes all children under the current element.
 */
DomBuilder.prototype.clearChildren = function () {
  while (this.current.hasChildNodes())
    this.current.removeChild(this.current.firstChild);
  return this;
}

/**
 * Appends a string to the current element.
 */
DomBuilder.prototype.appendText = function (str) {
  this.current.appendChild(document.createTextNode(str));
  return this;
};

/**
 * Sets an attribute of the current element.
 */
DomBuilder.prototype.setAttribute = function (name, value) {
  this.current[name] = value;
  return this;
};

/**
 * Sets a style attribute on the current node.
 */
DomBuilder.prototype.setStyle = function (name, value) {
  this.current.style[name] = value;
  return this;
}

/**
 * Adds a CSS class name to the current element.
 */
DomBuilder.prototype.addClass = function(name) {
  if (this.current.className) {
    this.current.className += " " + name;
  } else {
    this.current.className = name;
  }
  return this;
};

/**
 * Invokes the given thunk with the current node.
 */
DomBuilder.prototype.withCurrentNode = function (thunk) {
  thunk(this.current);
  return this;
};

/**
 * Returns the current node.
 */
DomBuilder.prototype.getCurrentNode = function () {
  return this.current;
};

/**
 * Invokes the given thunk with this builder and the current node.
 */
DomBuilder.prototype.delegate = function (thunk) {
  thunk(this, this.current);
  return this;
};

/**
 * Invokes the given thunk for each element in the collection, passing the
 * element, this builder, and the index of the element. Useful for building
 * subtrees of variable length.
 */
DomBuilder.prototype.forEach = function (elms, thunk) {
  elms.forEach(function (elm, index) {
    thunk(elm, this, index);
  }.bind(this));
  return this;
};

/**
 * Adds a listener for the given event type to the current element.
 */
DomBuilder.prototype.addEventListener = function (event, handler) {
  this.current.addEventListener(event, handler);
  return this;
}

/**
 * Ends the current element and replaces it as the current with its parent.
 */
DomBuilder.prototype.end = function () {
  this.stack.pop();
  this.current = this.stack[this.stack.length-1];
  return this;
};

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

/**
 * A collection of alerts belonging to a particular domain base.
 */
function AlertInfo(baseName, cookies) {
  this.baseName = baseName;
  this.cookies = cookies.map(function (cookie) { return new CookieInfo(cookie); });
  this.primaryCookieCache = null;
  this.openElement = null;
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
AlertInfo.prototype.display = function (builder) {
  var primary = this.getPrimaryCookie();
  var severityColor = RGB.between(RGB.LOW, primary.severity, RGB.HIGH);
  var rootNode;
  builder
    .delegate(function (_, node) { rootNode = node; })
    .begin("div")
      .addClass("alert")
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
};

AlertInfo.prototype.onClick = function (root, event) {
  if (this.openElement) {
    root.removeChild(this.openElement);
    this.openElement = null;
  } else {
    var primary = this.getPrimaryCookie();
    DomBuilder.attach(root)
      .begin("ul")
      .delegate(function (_, node) { this.openElement = node; }.bind(this))
      .forEach(primary.history, function (entry, builder) {
        entry.display(builder);
      })
      .end();
  }
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
AlertCollection.prototype.display = function (builder) {
  var baseNames = this.baseNames;
  var sortedNames = baseNames.keys();
  sortedNames.sort(function (a, b) {
    var aCookie = baseNames.get(a).getPrimaryCookie();
    var bCookie = baseNames.get(b).getPrimaryCookie();
    var sourceDiff = bCookie.getSourceCount() - aCookie.getSourceCount();
    if (sourceDiff != 0)
      return sourceDiff;
    return bCookie.getHistoryLength() - aCookie.getHistoryLength();
  });
  builder
    .clearChildren()
    .forEach(sortedNames, function (baseName, builder) {
      var alertInfo = baseNames.get(baseName);
      builder
        .begin("div")
          .delegate(alertInfo.display.bind(alertInfo))
        .end();
    });
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
    alerts.display(DomBuilder.attach(main));
  }
}

function onLoad() {
  var browser = getBrowserController();
  browser.sendRequest("getAlerts")
    .onFulfilled(displayAlerts)
    .onFailed(browser.getLogCallback());
}
