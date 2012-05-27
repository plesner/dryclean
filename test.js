function runTest() {
  for (var prop in window) {
    if (/test.*/.test(prop))
      doTest(window[prop]);
  }
}

function doTest(thunk) {
  var results = document.getElementById("results");
  var li;
  DomBuilder
    .attach(results)
    .begin("li")
      .delegate(function (_, node) { li = node; })
      .appendText(thunk.name)
    .end();
  Promise.defer(function () {
    var builder =  DomBuilder.attach(li);
    try {
      thunk(li);
      builder
        .appendText(" succeeded")
        .setStyle("color", "green");
    } catch (e) {
      builder
        .appendText(" failed: " + e)
        .setStyle("color", "red");
    }
  });
}

// --- F a k e   b r o w s e r ---

function FakeBrowserController() {
  this.sendHeadersListeners = [];
  this.cookieChangeListeners = [];
  this.cookieOracle = null;
  this.ignoreErrors = false;
}

FakeBrowserController.prototype.addSendHeadersListener = function (callback, filter, extraInfoSpec) {
  this.sendHeadersListeners.push(callback);
};

FakeBrowserController.prototype.addCookieChangeListener = function (callback) {
  this.cookieChangeListeners.push(callback);
};

FakeBrowserController.prototype.fireRequest = function (referer, target, extraHeadersOpt) {
  var headers = [];
  if (referer)
    headers.push({name: "Referer", value: referer});
  for (var name in extraHeadersOpt)
    headers.push({name: name, value: extraHeadersOpt[name]});
  var requestInfo = {
    url: target,
    requestHeaders: headers
  };
  return this.sendHeadersListeners.map(function (listener) {
    return listener(requestInfo);
  });
}

FakeBrowserController.prototype.getCookies = function (details) {
  return this.cookieOracle(details);
};

FakeBrowserController.prototype.setCookieOracle = function (oracle) {
  this.cookieOracle = oracle;
  return this;
};

FakeBrowserController.prototype.setIgnoreErrors = function (value) {
  this.ignoreErrors = value;
  return this;
};

FakeBrowserController.prototype.getLogCallback = function () {
  return function (error, trace) {
    assertTrue(this.ignoreErrors);
  }.bind(this);
};

// --- T e s t   f r a m e w o r k ---

function deepEquals(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length != b.length)
      return false;
    for (var i = 0; i < a.length; i++) {
      if (!deepEquals(a[i], b[i]))
        return false;
    }
    return true;
  } else {
    return a == b;
  }
}

function assertEquals(a, b) {
  if (!deepEquals(a, b)) {
    throw new Error(a + " != " + b);
  }
}

function assertTrue(a) {
  if (!a) {
    throw new Error(a);
  }
}

function assertFalse(a) {
  assertTrue(!a);
}

// --- T e s t s ---

function testSimpleUrls() {
  var u0 = Url.parse("http://foo.com/blah");
  assertEquals("http", u0.protocol);
  assertEquals("foo.com", u0.domain);
  assertEquals("/blah", u0.path);
  assertEquals("foo-bar-baz.com", Url.parse("http://foo-bar-baz.com/blah").domain);
  assertEquals("https", Url.parse("https://foo-bar-baz.com/blah").protocol);
  assertEquals("", Url.parse("http://foo.com").path);
}

function testUrlBaseDomain() {
  function getBase(str) {
    return Url.parse(str).baseDomain;
  }
  assertEquals("com", getBase("http://com/fas"));
  assertEquals("com.au", getBase("http://com.au/fas"));
  assertEquals("blah.com", getBase("http://a.b.blah.com/fas"));
  assertEquals("blah.com", getBase("http://a.b.blah.com:1002/fas"));
  assertEquals("blah.com.au", getBase("http://a.b.blah.com.au/fas"));
  assertEquals("guardian.co.uk", getBase("http://a.b.guardian.co.uk/fas"));
}

function testUrlBaseName() {
  function getBase(str) {
    return Url.parse(str).getBaseName();
  }
  assertEquals("com", getBase("http://com/fas"));
  assertEquals("com", getBase("http://com.au/fas"));
  assertEquals("blah", getBase("http://a.b.blah.com/fas"));
  assertEquals("blah", getBase("http://a.b.blah.com.au/fas"));
  assertEquals("guardian", getBase("http://a.b.guardian.co.uk/fas"));
}

function newCookie(domain, path, name, sessionOpt, valueOpt) {
  return StrippedCookie.from({domain: domain, path: path, name: name,
    session: sessionOpt, value: valueOpt});
}

function testCookieIds() {
  assertTrue(newCookie("foo", "/", "bar").getId() == newCookie("foo", "/", "bar").getId());
  assertTrue(newCookie("foo", "/ba", "r").getId() != newCookie("foo", "/", "bar").getId());
  assertTrue(newCookie("f", "oo/", "bar").getId() != newCookie("foo", "/", "bar").getId());
  assertTrue(newCookie("foo", "/bar/", "baz").getId() != newCookie("foo/", "bar/", "baz").getId());
}

function testMaps() {
  var map = new Map();
  assertFalse(map.contains("toString"));
  assertFalse(map.contains("__proto__"));
  assertEquals(0, map.getSize());
  assertEquals(null, map.get("toString"));
  map.put("foo", "bar");
  assertEquals(1, map.getSize());
  assertEquals("bar", map.get("foo"));
  map.put("foo", "baz");
  assertEquals(1, map.getSize());
  assertEquals("baz", map.get("foo"));
  map.put("toString", "asda");
  assertEquals(2, map.getSize());
  assertEquals("asda", map.get("toString"));
  assertEquals("baz", map.remove("foo"));
  assertEquals(1, map.getSize());
  assertEquals(null, map.remove("foo"));
  assertEquals(1, map.getSize());
}

function testIdentifying() {
  function isValueIdentifying(value) {
    return newCookie("x", "x", "x", false, value).isIdentifying();
  }
  assertFalse(isValueIdentifying(""));
  assertFalse(isValueIdentifying("1"));
  assertFalse(isValueIdentifying("foobar"));
  assertTrue(isValueIdentifying("adasadlkfnlqwkenclsainrslaienwpa"));
}

function testThirdPartyDetection() {
  var controller = new FakeBrowserController()
    .setCookieOracle(function () { return Promise.error(null); })
    .setIgnoreErrors(true);
  var processor = new RequestProcessor(controller, null);
  // Malformed urls
  assertEquals([false], controller.fireRequest("asedfase", "http://www.foo.com.au", {Cookie: "x"}));
  assertEquals([false], controller.fireRequest("http://www.foo.com", "asdfwe", {Cookie: "x"}));
  assertEquals([true], controller.fireRequest("http://www.foo.com", "http://com", {Cookie: "x"}));
  // Urls with the same base subdomain.
  assertEquals([false], controller.fireRequest("http://www.foo.com", "http://www.foo.com.au", {Cookie: "x"}));
  assertEquals([false], controller.fireRequest("http://www.bar.com", "http://www.blob.bar.com", {Cookie: "x"}));
  assertEquals([false], controller.fireRequest("http://www.blob.bar.com", "http://www.bar.com", {Cookie: "x"}));
  // Urls with different subdomains.
  assertEquals([true], controller.fireRequest("http://www.foo.com", "http://www.bar.com", {Cookie: "blah"}));
  assertEquals([true], controller.fireRequest("http://www.bar.foo.com", "http://www.foo.bar.com", {Cookie: "blah"}));
  assertEquals([true], controller.fireRequest("http://www.foo.com", "http://www.foo.bar.com", {Cookie: "blah"}));
  // No cookies or referer
  assertEquals([false], controller.fireRequest("http://www.foo.com", "http://www.bar.com", {}));
  assertEquals([false], controller.fireRequest(null, "http://www.bar.com", {Cookie: "blah"}));
}

function testGradualColors(root) {
  var gradients = [
    [RGB.WHITE, RGB.RED, RGB.GREEN, RGB.BLUE, RGB.BLACK],
    SEVERITY_GRADIENT.concat([RGB.BLACK]),
    SEVERITY_GRADIENT,
  ];
  gradients.forEach(function (gradient) {
    var builder = DomBuilder
      .attach(root)
      .begin("div")
      .setStyle("float", "right")
    for (var i = 0; i <= 100; i++) {
      var part = i / 100;
      var color = RGB.gradient(part, gradient);
      builder
        .begin("div")
          .setStyle("width", "3px")
          .setStyle("height", "3px")
          .setStyle("margin", "1px")
          .setStyle("background", color)
          .setStyle("float", "left")
        .end();
    }
    builder.end();
  });
}
