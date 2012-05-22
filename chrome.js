/**
 * Wrapper around the browser api that allows the browser interaction to
 * be mocked out for testing.
 */
function ChromeController() { }

/**
 * Adds a send headers listener. See
 * http://code.google.com/chrome/extensions/webRequest.html#event-onSendHeaders.
 */
ChromeController.prototype.addSendHeadersListener = function (callback, filter, extraInfoSpec) {
  return chrome.webRequest.onSendHeaders.addListener(callback, filter, extraInfoSpec);
};

/**
 * Adds a cookie change listener. See
 * http://code.google.com/chrome/extensions/cookies.html#event-onChanged
 */
ChromeController.prototype.addCookieChangeListener = function (callback) {
  return chrome.cookies.onChanged.addListener(callback);
};

/**
 * Adds a connect listener. See
 * http://code.google.com/chrome/extensions/extension.html#event-onConnect
 */
ChromeController.prototype.addConnectListener = function (callback) {
  return chrome.extension.onConnect.addListener(callback);
};

/**
 * Returns a promise that will yield all cookies matching the given details.
 * See http://code.google.com/chrome/extensions/cookies.html#method-getAll.
 */
ChromeController.prototype.getCookies = function (details) {
  return Promise.fromCallbackMethod(chrome.cookies, 'getAll', details);
};

/**
 * Sets the badge text for this browser action. See
 * http://code.google.com/chrome/extensions/browserAction.html#method-setBadgeText.
 */
ChromeController.prototype.setBadgeText = function (details) {
  return chrome.browserAction.setBadgeText(details);
};

/**
 * Sets the badge color for this browser action. See
 * http://code.google.com/chrome/extensions/browserAction.html#method-setBadgeBackgroundColor
 */
ChromeController.prototype.setBadgeBackgroundColor = function (details) {
  console.log(details);
  return chrome.browserAction.setBadgeBackgroundColor(details);
};

/**
 * Sets the title for this browser action. See
 * http://code.google.com/chrome/extensions/browserAction.html#method-setTitle
 */
ChromeController.prototype.setBrowserActionTitle = function (details) {
  return chrome.browserAction.setTitle(details);
};

/**
 * Returns a callback that will log any errors to the console.
 */
ChromeController.prototype.getLogCallback = function () {
  return function (error, trace) {
    console.log(trace.toString());
  };
};

/**
 * Returns a controller for chrome.
 */
function getBrowserController() {
  return new ChromeController();
}
