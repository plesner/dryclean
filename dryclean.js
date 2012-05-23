function Alert(record) {
  this.record = record;
}

Alert.prototype.toJSON = function () {
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
function CookieTransmission(target, referer, timestamp) {
  this.target = target;
  this.referer = referer;
  this.timestamp = timestamp;
}

/**
 * A record for a single cookie.
 */
function CookieRecord(protoCookie) {
  this.protoCookie = protoCookie;
  this.sourceDomains = new Map();
  this.history = [];
  this.value = protoCookie.value;
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
      value: this.value
    },
    sources: this.sourceDomains.keys(),
    history: this.history,
    severity: this.getSeverity()
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
CookieRecord.prototype.notifySentToThirdParty = function (timestamp, target, referer, cookie) {
  this.updateValue(cookie.value);
  this.sourceDomains.put(referer.getBaseSubdomain(), true);
  this.history.push(new CookieTransmission(target, referer, timestamp));
};

/**
 * Returns the domain name of where this cookie belongs.
 */
CookieRecord.prototype.getBaseName = function () {
  return this.baseName;
};

/**
 * Returns the severity of the activity recorded by this object. -1 means
 * no severity, a value between 0 and 1 means nontrivial severity.
 */
CookieRecord.prototype.getSeverity = function () {
  if (this.sourceDomains.getSize() < 3) {
    return -1;
  } else if (this.sourceDomains.size < 5) {
    return 0;
  } else if (this.sourceDomains.size < 10) {
    return 0.5;
  } else {
    return 1;
  }
};

function CookieData(protoCookie) {
  this.record = new CookieRecord(protoCookie);
  this.lastSeenSeverity = -1;
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
TrackingCookieDetector.prototype.recordThirdPartyCookie = function (timestamp, target, referer, cookie) {
  var data = this.ensureDataFor(cookie);
  var record = data.record;
  record.notifySentToThirdParty(timestamp, target, referer, cookie);
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
  if (oldData && oldData.lastSeenSeverity != -1)
    this.fireSeverityChanged(oldData.record, -1);
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
RequestProcessor.prototype.processThirdPartyCookies = function (timestamp, requestUrl, refererUrl, cookies) {
  var detector = this.detector;
  cookies.forEach(function (cookie) {
    var strippedCookie = StrippedCookie.from(cookie);
    detector.recordThirdPartyCookie(timestamp, requestUrl, refererUrl, strippedCookie);
  });
};

/**
 * Processes a reques that is known to be going to a third party.
 */
RequestProcessor.prototype.processThirdPartyRequest = function (timestamp, requestUrl, refererUrl) {
  // Fetch the cookies through the cookie api. We do it this way because that
  // gives more information about the cookies than using the Cookie header
  // from the request info.
  this.browser.getCookies({url: requestUrl.getFullUrl()})
    .onFulfilled(this.processThirdPartyCookies.bind(this, timestamp, requestUrl, refererUrl))
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
  this.processThirdPartyRequest(requestInfo.timeStamp, requestUrl, refererUrl);
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
  browser.addOnRequestListener(this.onRequest.bind(this));
  this.browser.setBadgeText({text: ""});
}

BadgeController.prototype.onSeverityChanged = function (record, severity) {
  var baseName = record.getBaseName();
  if (severity == -1) {
    this.removeRecord(baseName, record);
  } else {
    this.updateRecord(baseName, record);
  }
  this.updateBadgeState();
};

BadgeController.prototype.onRequest = function (request, sender, sendResponse) {
  var method = request[0];
  var args = request.slice(1);
  try {
    var value = this[method].apply(this, args);
    sendResponse({failed: false, data: value});
  } catch (e) {
    sendResponse({failed: true, data: String(e)});
  }
};

BadgeController.prototype.getAlerts = function () {
  return {state: this};
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
};

/**
 * Returns the current highest severity.
 */
BadgeController.prototype.getHighestSeverity = function () {
  var value = -1;
  this.baseNames.forEach(function (baseName, records) {
    records.forEach(function (id, record) {
      var severity = record.getSeverity();
      if (severity > value)
        value = severity;
    });
  });
  return value;
};

BadgeController.prototype.updateBadgeState = function () {
  var severity = this.getHighestSeverity();
  var color = RGB.between(RGB.LOW, severity, RGB.HIGH);
  this.browser.setBadgeBackgroundColor({color: String(color)});
  this.browser.setBadgeText({text: String(this.baseNames.getSize())});
};

BadgeController.prototype.toJSON = function () {
  return {
    baseNames: this.baseNames.map(function (elm) {
      return elm.values();
    })
  };
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
