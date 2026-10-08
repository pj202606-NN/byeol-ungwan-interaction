(function () {
  function parsePx(varName, fallback) {
    var val = getComputedStyle(document.documentElement).getPropertyValue(varName);
    var num = parseFloat(val);
    return isNaN(num) ? fallback : num;
  }

  function fitScreen() {
    var screenWidth = parsePx('--screen-width', 1920);
    var screenHeight = parsePx('--screen-height', 1080);
    var scale = Math.min(window.innerWidth / screenWidth, window.innerHeight / screenHeight);
    document.documentElement.style.setProperty('--scale', scale);
  }

  window.addEventListener('resize', fitScreen);
  fitScreen();
})();
