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
