/**
 * The number of base names beyond which we don't bother to count.
 */
var baseNameCountMax = 20;

/**
 * At which severity do we display a count on the badge?
 */
var displayBadgeSeverity = 0.25;

/**
 * At which severity do we display an alert in the popup?
 */
var displayInPopupSeverity = 0.15;

/**
 * The sequence of colors used to signal severity, low to high.
 */
var SEVERITY_GRADIENT = [RGB.WHITE, RGB.WARM_YELLOW, RGB.WARM_RED];
