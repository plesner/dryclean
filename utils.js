/**
 * Shorthand for the promise constructor.
 */
var Promise = (window.promise ? promise.Promise : null);

/**
 * Converts a value to a JSON-able object or returns it unchanged if it has
 * no custom converter method.
 */
function safeToJSON(value) {
  var method = value.toJSON;
  return method ? value.toJSON() : value;
}

/**
 * An associative map from strings to values.
 */
function Map(elementsOpt, sizeOpt) {
  this.elements = elementsOpt || {};
  this.size = sizeOpt || 0;
}

/**
 * Returns a new map that wraps the given json object literal.
 */
Map.wrap = function (json) {
  var size = 0;
  for (var prop in json) {
    if (json.hasOwnProperty(prop))
      size++;
  }
  return new Map(json, size);
};

/**
 * Returns the number of elements in this map.
 */
Map.prototype.getSize = function () {
  return this.size;
};

/**
 * Adds a mapping to this map.
 */
Map.prototype.put = function (key, value) {
  if (!this.elements.hasOwnProperty(key))
    this.size++;
  this.elements[key] = value;
};

/**
 * Returns true if this map has a mapping for the given key.
 */
Map.prototype.contains = function (key) {
  return this.elements.hasOwnProperty(key);
};

/**
 * Returns the mapping for the given key or, if there is none, the specified
 * default value.
 */
Map.prototype.get = function (key, defawltOpt) {
  return this.elements.hasOwnProperty(key) ? this.elements[key] : defawltOpt;
};

Map.prototype.map = function (mapping) {
  var result = new Map();
  this.forEach(function (key, value) {
    result.put(key, mapping(value, key));
  });
  return result;
};

/**
 * Removes a mapping from this map. Returns the removed value if one was
 * removed, otherwise the optional default value.
 */
Map.prototype.remove = function (key, ifAbsentOpt) {
  if (this.elements.hasOwnProperty(key)) {
    var value = this.elements[key];
    this.size--;
    delete this.elements[key];
    return value;
  } else {
    return ifAbsentOpt;
  }
};

/**
 * Returns a list of all the keys of this map.
 */
Map.prototype.keys = function () {
  var result = [];
  this.forEach(function (key) {
    result.push(key);
  });
  return result;
};

/**
 * Returns a list of all the values of this map.
 */
Map.prototype.values = function () {
  var result = [];
  this.forEach(function (key, value) {
    result.push(value);
  });
  return result;
};

/**
 * Converts this map to json by recursively calling toJson on the values.
 */
Map.prototype.toJSON = function () {
  var result = {};
  this.forEach(function (key, value) {
    result[safeToJSON(key)] = safeToJSON(value);
  });
  return result;
};

/**
 * Invokes the given function for each mapping in this map, giving the
 * key as the first argument and the value as the second.
 */
Map.prototype.forEach = function (thunk) {
  for (var prop in this.elements) {
    if (this.elements.hasOwnProperty(prop))
      thunk(prop, this.elements[prop]);
  }
};

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
Url.prototype.toJSON = function () {
  return this.fullUrl;
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
 * Returns the subdomain name from the base domain for this URL (eg. "baz" for
 * the full domain "foo.bar.baz.co.uk").
 */
Url.prototype.getBaseName = function () {
  return this.baseName;
};

/**
 * Returns the full string value of this URL.
 */
Url.prototype.getFullUrl = function () {
  return this.fullUrl;
};

/**
 * Returns the full path component of this URL.
 */
Url.prototype.getPath = function () {
  return this.path;
};

Url.prototype.getFileName = function () {
  var parts = this.path.split("/");
  for (var i = parts.length - 1; i >= 0; i--) {
    if (parts[i].length > 0)
      return parts[i];
  }
  return null;
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

/**
 * Simple wrapper around a rgb color.
 */
function RGB(r, g, b) {
  this.r = r;
  this.g = g;
  this.b = b;
}

/**
 * Returns a color that is the given ratio darker than this one.
 */
RGB.prototype.darker = function (ratio) {
  return RGB.between(this, ratio, RGB.BLACK);
};

RGB.prototype.toString = function () {
  function toHex(value) {
    var rounded = value << 0;
    if (rounded < 16) {
      return "0" + rounded.toString(16);
    } else {
      return rounded.toString(16);
    }
  }
  return "#" + toHex(this.r) + toHex(this.g) + toHex(this.b);
};

/**
 * Returns the color that is the given ratio (0 to 1) between from and to.
 */
RGB.between = function (from, ratio, to) {
  var r = (to.r * ratio) + (from.r * (1 - ratio));
  var g = (to.g * ratio) + (from.g * (1 - ratio));
  var b = (to.b * ratio) + (from.b * (1 - ratio));
  return new RGB(r, g, b);
};

/**
 * Returns the color that is the given ratio (0 to 1) along the way of a
 * gradient going between the specified list of colors.
 */
RGB.gradient = function (ratio, colors) {
  var stepCount = colors.length - 1;
  var gradient = ratio * stepCount;
  var gradientStep = Math.min(gradient << 0, stepCount - 1);
  return RGB.between(colors[gradientStep], gradient - gradientStep, colors[gradientStep+1]);
};

RGB.WARM_RED = new RGB(0xDB, 0x25, 0x25);
RGB.WARM_YELLOW = new RGB(0xFF, 0xD7, 0x00);
RGB.LOW = new RGB(0xFF, 0xFF, 0xFF);
RGB.WHITE = new RGB(0xFF, 0xFF, 0xFF);
RGB.BLACK = new RGB(0x00, 0x00, 0x00);
RGB.RED = new RGB(0xFF, 0x00, 0x00);
RGB.GREEN = new RGB(0x00, 0xFF, 0x00);
RGB.BLUE = new RGB(0x00, 0x00, 0xFF);

/**
 * Returns the color to use for the specified severity.
 */
function getSeverityColor(severity) {
  return RGB.gradient(severity, SEVERITY_GRADIENT);
}

/**
 * A read/write map connected to local storage.
 */
function MapStorage(key, map) {
  this.key = key;
  this.map = map;
  this.listeners = [];
  addEventListener("storage", this.onChange.bind(this), false);
}

MapStorage.prototype.addChangeListener = function (thunk) {
  this.listeners.push(thunk);
};

MapStorage.prototype.onChange = function (event) {
  console.log(event);
  if (event.key == this.key) {
    var newMap = MapStorage.parseMap(event.newValue);
    this.map = newMap;
    this.listeners.forEach(function (thunk) {
      thunk(newMap);
    });
  }
};

MapStorage.prototype.put = function (key, value) {
  this.map.put(key, value);
  localStorage.setItem(this.key, JSON.stringify(this.map));
};

MapStorage.prototype.get = function (key) {
  return this.map.get(key);
};

MapStorage.parseMap = function (value) {
  if (value) {
    try {
      return Map.wrap(JSON.parse(value));
    } catch (se) {
      // ignore
    }
  }
  return new Map();
};

MapStorage.create = function (key) {
  return new MapStorage(key, MapStorage.parseMap(localStorage[key]));
};
