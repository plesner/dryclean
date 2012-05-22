/**
 * Shorthand for the promise constructor.
 */
var Promise = promise.Promise;

/**
 * A URL split into its component parts.
 */
function Url(fullUrl, protocol, domain, path) {
  this.fullUrl = fullUrl;
  this.protocol = protocol;
  this.domain = domain;
  this.path = path;
  parseDomainParts(domain, this);
}

/**
 * Converts this URL to a JSON object.
 */
Url.prototype.toJson = function () {
  return {
    url: this.fullUrl,
    base: this.baseSubdomain
  };
};

/**
 * Returns the full domain of this URL (eg. "foo.bar.baz.com").
 */
Url.prototype.getDomain = function () {
  return this.domain;
};

/**
 * Returns the base domain of this URL, that is, the TLD and the first
 * subdomain (eg. "baz.co.uk" for the full domain "foo.bar.baz.co.uk").
 */
Url.prototype.getBaseDomain = function () {
  return this.baseDomain;
};

/**
 * Returns the subdomain from the base domain for this URL (eg. "baz" for
 * the full domain "foo.bar.baz.co.uk").
 */
Url.prototype.getBaseSubdomain = function () {
  return this.baseSubdomain;
};

/**
 * Returns the full string value of this URL.
 */
Url.prototype.getFullUrl = function () {
  return this.fullUrl;
};

var URL_PATTERN = /(\w+):\/\/([^\/:]+)(:\d+)?(\/.*)?/;
/**
 * Parses a URL into its component parts. If the given string is not a valid
 * url (as defined by this simple parser) null is returned.
 */
Url.parse = function (url) {
  var parts = URL_PATTERN.exec(url);
  if (!parts) {
    return null;
  } else {
    return new Url(url, parts[1], parts[2], parts[4] || "");
  }
};

function Alert(record) {
  this.record = record;
}

Alert.prototype.toJson = function () {
  return {
    domain: this.getDomain(),
    sources: this.record.sourceDomains.keys(),
    name: this.record.name,
    value: this.record.value
  };
}

Alert.prototype.getDomain = function () {
  var parts = [];
  this.record.domain.split('.').forEach(function (part) {
    if (part.length > 0)
      parts.push(part);
  });
  return parts.join(".");
};

/**
 * A record of a cookie being sent to a third party.
 */
function CookieTransmission(target, referer) {
  this.target = target;
  this.referer = referer;
}

CookieTransmission.prototype.toJson = function () {
  return {target: this.target.toJson(), referer: this.referer.toJson()};
};

/**
 * A record for a single cookie.
 */
function CookieRecord(protoCookie) {
  this.protoCookie = protoCookie;
  this.sourceDomains = new Map();
  this.history = [];
  var domainParts = parseDomainParts(protoCookie.domain);
  this.baseName = domainParts.baseSubdomain;
}

/**
 * Returns the proto cookie for this record.
 */
CookieRecord.prototype.getCookie = function () {
  return this.protoCookie;
};

/**
 * Returns a JSON representation of this record's data.
 */
CookieRecord.prototype.toJSON = function () {
  return {
    cookie: {
      domain: this.protoCookie.domain,
      path: this.protoCookie.path,
      name: this.protoCookie.name,
    },
    sources: this.sourceDomains.keys(),
    history: this.history.map(function (e) { return e.toJson() })
  };
};

/**
 * Updates this record according to the given new cookie value. If the value
 * changes we flush all history.
 */
CookieRecord.prototype.updateValue = function (value) {
  // If it has been sent with a different value we clear the record.
  if (value != this.value)
    this.resetValue(value);
};

/**
 * Resets the cookie value to the given one and clears all state that depended
 * on the old value.
 */
CookieRecord.prototype.resetValue = function (value) {
  this.value = value;
  this.sourceDomains = new Map();
  this.history = [];
};

/**
 * Records the fact that this cookie has been sent to a third party.
 */
CookieRecord.prototype.notifySentToThirdParty = function (target, referer, cookie) {
  this.updateValue(cookie.value);
  this.sourceDomains.put(referer.getBaseSubdomain(), true);
  this.history.push(new CookieTransmission(target, referer));
};

/**
 * Returns the domain name of where this cookie belongs.
 */
CookieRecord.prototype.getBaseName = function () {
  return this.baseName;
};

/**
 * Returns the severity of the activity recorded by this object.
 */
CookieRecord.prototype.getSeverity = function () {
  if (this.sourceDomains.size >= 3) {
    return 1;
  } else if (this.sourceDomains.size >= 5) {
    return 2;
  } else if (this.sourceDomains.size >= 10) {
    return 3;
  } else {
    return 0;
  }
};

function CookieData(protoCookie) {
  this.record = new CookieRecord(protoCookie);
  this.lastSeenSeverity = 0;
}

/**
 * Object that keeps track of potential tracking cookies.
 */
function TrackingCookieDetector() {
  // A mapping from cookie ids to records of their activity.
  this.cookieData = new Map();
  this.eventListeners = [];
}

TrackingCookieDetector.prototype.addListener = function (listener) {
  this.eventListeners.push(listener);
};

/**
 * Gets or creates the cookie record for the given cookie.
 */
TrackingCookieDetector.prototype.ensureDataFor = function (cookie) {
  var record = this.cookieData.get(cookie.getId());
  if (!record) {
    record = new CookieData(cookie);
    this.cookieData.put(cookie.getId(), record);
  }
  return record;
};

/**
 * Records that a request has been sent to a third party containing a cookie.
 */
TrackingCookieDetector.prototype.recordThirdPartyCookie = function (target, referer, cookie) {
  var data = this.ensureDataFor(cookie);
  var record = data.record;
  record.notifySentToThirdParty(target, referer, cookie);
  var severity = record.getSeverity();
  if (severity != data.lastSeenSeverity) {
    data.lastSeenSeverity = severity;
    this.fireSeverityChanged(data.record, severity);
  }
};

/**
 * Notifies all listener that the severity of a cookie has changed.
 */
TrackingCookieDetector.prototype.fireSeverityChanged = function (record, severity) {
  this.eventListeners.forEach(function (listener) {
    listener.onSeverityChanged.call(listener, record, severity);
  });
};

/**
 * Removes the tracking record for the given cookie.
 */
TrackingCookieDetector.prototype.removeRecord = function (cookie) {
  var oldData = this.cookieData.remove(cookie.getId());
  if (oldData && oldData.lastSeenSeverity > 0)
    this.fireSeverityChanged(oldData.record, 0);
};

/**
 * Refreshes the tracking record after the value has changed.
 */
TrackingCookieDetector.prototype.cookieUpdated = function (cookie) {
  var data = this.cookieData.get(cookie.getId());
  if (data != null)
    data.record.updateValue(cookie.value);
};

/**
 * Utility that processes all the raw requests and passes the relevant data on
 * to the tracking cookie detector.
 */
function RequestProcessor(browser, detector) {
  this.browser = browser;
  this.detector = detector;
  browser.addSendHeadersListener(this.handleSendHeaders.bind(this),
    {urls: ["*://*/*"]},
    ["requestHeaders"]);
  browser.addCookieChangeListener(this.handleCookieChanged.bind(this));
}

/**
 * Given a request, its referer, and the cookies that were sent with the
 * request, record this event with the detector.
 */
RequestProcessor.prototype.processThirdPartyCookies = function (requestUrl, refererUrl, cookies) {
  var detector = this.detector;
  cookies.forEach(function (cookie) {
    var strippedCookie = StrippedCookie.from(cookie);
    detector.recordThirdPartyCookie(requestUrl, refererUrl, strippedCookie);
  });
};

/**
 * Processes a reques that is known to be going to a third party.
 */
RequestProcessor.prototype.processThirdPartyRequest = function (requestUrl, refererUrl) {
  // Fetch the cookies through the cookie api. We do it this way because that
  // gives more information about the cookies than using the Cookie header
  // from the request info.
  this.browser.getCookies({url: requestUrl.getFullUrl()})
    .onFulfilled(this.processThirdPartyCookies.bind(this, requestUrl, refererUrl))
    .onFailed(this.browser.getLogCallback());
};

/**
 * Invoked after a request headers have been sent. Since we're not going to
 * affect the request in any way we might just as well process them after the
 * fact.
 *
 * Returns true if the request was determined to be a third-party one.
 */
RequestProcessor.prototype.handleSendHeaders = function (requestInfo) {
  // First extract the referer header from the request info.
  var referer = null;
  var hasCookies = false;
  for (var i in requestInfo.requestHeaders) {
    var header = requestInfo.requestHeaders[i];
    if (header.name.indexOf("Referer") != -1 && referer == null)
      referer = header.value;
    if (header.name == "Cookie")
      hasCookies = true;
  }
  // If there's no referer we can't tell if this request is going to a third
  // party. If there are no cookies we don't care about this request.
  if (referer == null || !hasCookies)
    return false;
  // Parse the referer and the request target.
  var refererUrl = Url.parse(referer);
  if (refererUrl == null)
    return false;
  var requestUrl = Url.parse(requestInfo.url);
  if (requestUrl == null)
    return false;
  if (refererUrl.getBaseSubdomain() == requestUrl.getBaseSubdomain())
    // This request seems to be going to the same place so that seems okay.
    return false;
  // We've verified that this request is going to a third party. Now we have
  // to check the cookies going with it.
  this.processThirdPartyRequest(requestUrl, refererUrl);
  return true;
};

/**
 * A wrapper around a cookie's data that discards anything that's not relevant
 * to what we're doing.
 */
function StrippedCookie(domain, path, name, value) {
  this.domain = domain;
  this.path = path;
  this.name = name;
  this.value = value;
  this.id = this.buildId();
}

/**
 * Returns a unique string id for this cookie.
 */
StrippedCookie.prototype.getId = function () {
  return this.id;
};

/**
 * Returns a unique string id for this cookie.
 */
StrippedCookie.prototype.buildId = function () {
  return encodeURIComponent(this.domain) + "/" +
      encodeURIComponent(this.path) + "/" +
      encodeURIComponent(this.name);
};

/**
 * Returns a stripped cookie that contains information from the given chrome
 * cookie.
 */
StrippedCookie.from = function (cookie) {
  return new StrippedCookie(cookie.domain, cookie.path, cookie.name,
    cookie.value);
}

/**
 * Updates state to reflect the given change in cookie data.
 */
RequestProcessor.prototype.handleCookieChanged = function (cookieInfo) {
  if (cookieInfo.cause == "overwrite") {
    // ignore
  } else if (cookieInfo.removed) {
    this.detector.removeRecord(StrippedCookie.from(cookieInfo.cookie));
  } else {
    this.detector.cookieUpdated(StrippedCookie.from(cookieInfo.cookie));
  }
}

/**
 * Controller type that updates the badge according to cookie severity.
 */
function BadgeController(browser) {
  this.browser = browser;
  this.baseNames = new Map();
  browser.addConnectListener(this.handleConnection.bind(this));
}

BadgeController.prototype.onSeverityChanged = function (record, severity) {
  var baseName = record.getBaseName();
  if (severity == 0) {
    this.removeRecord(baseName, record);
  } else {
    this.updateRecord(baseName, record);
  }
  this.updateBadgeState();
};

/**
 * Updates the record for the given record which belongs under the given base name.
 */
BadgeController.prototype.updateRecord = function (baseName, record) {
  var map = this.baseNames.get(baseName);
  if (!map) {
    map = new Map();
    this.baseNames.put(baseName, map);
  }
  map.put(record.getCookie().getId(), record);
};

/**
 * Removes the given record from the data under the given base name.
 */
BadgeController.prototype.removeRecord = function (baseName, record) {
  var map = this.baseNames.get(baseName);
  if (map) {
    map.remove(record.getCookie().getId());
    if (map.getSize() == 0)
      this.baseNames.remove(baseName);
  }
}

BadgeController.prototype.updateBadgeState = function () {
  this.browser.setBadgeText({text: String(this.baseNames.getSize())});
  this.browser.setBrowserActionTitle({title: this.baseNames.keys().join(", ")});
};

BadgeController.prototype.toJSON = function () {
  return {baseNames: this.baseNames.map(function (elm) { return elm.values(); })};
};

BadgeController.prototype.handleConnection = function (port) {
  if (port.name != "dryclean.popup")
    return;
  port.postMessage({state: this});
}

/**
 * Install the tracking code.
 */
function installDryClean() {
  var browser = getBrowserController();
  var detector = new TrackingCookieDetector();
  var controller = new BadgeController(browser);
  detector.addListener(controller);
  new RequestProcessor(browser, detector);
}
