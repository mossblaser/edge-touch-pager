/**
 * Get the current effective options.
 */
async function getOptions() {
  const defaults = await (await fetch(browser.runtime.getURL("defaults.json"))).json();
  return Object.assign({}, defaults, await browser.storage.local.get(null));
}

// Keep controls in sync with config
async function configChanged() {
  const {
    enabled,
    edgeButtonsEnabled,
    keyboardEnabled,
    buttonWidth,
    screenfulUnderscroll,
    longPressDuration,
    smooth,
  } = await getOptions();
  
  // Master enable
  const enabledLabel = document.getElementById("enabled-label");
  const enableButton = document.getElementById("enable-button");
  if (enabled) {
    enabledLabel.innerText = "enabled";
    enableButton.innerText = "Disable edge-touch pager";
  } else {
    enabledLabel.innerText = "disabled";
    enableButton.innerText = "Enable edge-touch pager";
  }
  
  // Edge touch enable
  const enableEdgeTouch = document.getElementById("enable-edge-touch");
  enableEdgeTouch.checked = edgeButtonsEnabled;
  
  // Keyboard enable
  const enableKeyboard = document.getElementById("enable-keyboard");
  enableKeyboard.checked = keyboardEnabled;
  
  // Edge touch width
  const touchWidth = document.getElementById("touch-width");
  const testEdges = document.getElementsByClassName("edge-size");
  touchWidth.value = buttonWidth;
  for (const testEdge of testEdges) {
    testEdge.style.width = `${buttonWidth}px`;
  }
  
  // Underscroll
  const underscroll = document.getElementById("underscroll");
  const testUnderscrolls = document.getElementsByClassName("underscroll-size");
  underscroll.value = screenfulUnderscroll;
  for (const testUnderscroll of testUnderscrolls) {
    testUnderscroll.style.height = `${screenfulUnderscroll}px`;
  }
  
  // Long-press duration
  const longPressDurationSlider = document.getElementById("long-press-duration");
  longPressDurationSlider.value = longPressDuration;
  
  // Smooth scrolling
  const smoothScrollSwitch = document.getElementById("smooth-scroll");
  smoothScrollSwitch.checked = smooth;
}
browser.storage.local.onChanged.addListener(configChanged);
configChanged()


// Store settings
async function toggle(option) {
  const newValue = !(await getOptions())[option];
  browser.storage.local.set({[option]: newValue});
}
async function setOption(option, value) {
  browser.storage.local.set({[option]: value});
}

document.getElementById("enable-button").addEventListener(
  "click", () => toggle("enabled"));
document.getElementById("enable-edge-touch").addEventListener(
  "click", () => toggle("edgeButtonsEnabled"));
document.getElementById("enable-keyboard").addEventListener(
  "click", () => toggle("keyboardEnabled"));

document.getElementById("touch-width").addEventListener(
  "input", (evt) => browser.storage.local.set({buttonWidth: evt.target.value}));
document.getElementById("underscroll").addEventListener(
  "input", (evt) => browser.storage.local.set({
      screenfulUnderscroll: evt.target.value,
      // XXX: At the moment this setting is simply implicitly defined as half
      // the normal underscroll -- perhaps one day this should have its own
      // slider?
      toEdgeUnderscroll: evt.target.value / 2,
    }
  )
);
document.getElementById("long-press-duration").addEventListener(
  "input", (evt) => browser.storage.local.set({longPressDuration: evt.target.value}));
document.getElementById("smooth-scroll").addEventListener(
  "click", () => toggle("smooth"));


// Long-press tester
function setupLongPressTestButton() {
  let timeoutId = null;
  
  function testButtonDown(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    
    const longPressTestButton = document.getElementById("long-press-test");
    longPressTestButton.setAttribute("aria-busy", true);
    longPressTestButton.innerText = "Keep pressing...";
    
    (async function () {
      const longPressDuration = (await getOptions())["longPressDuration"];
      
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        longPressTestButton.setAttribute("aria-busy", false);
        longPressTestButton.innerText = "Long press successful!";
      }, longPressDuration);
    })();
  }
  
  function testButtonUp(evt) {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
      
      longPressTestButton.setAttribute("aria-busy", false);
      longPressTestButton.innerText = "Didn't press for long enough";
    }
  }
  
  const longPressTestButton = document.getElementById("long-press-test");
  longPressTestButton.addEventListener("touchstart", testButtonDown);
  longPressTestButton.addEventListener("mousedown", testButtonDown);
  document.body.addEventListener("touchend", testButtonUp);
  document.body.addEventListener("mouseup", testButtonUp);
}
setupLongPressTestButton();
