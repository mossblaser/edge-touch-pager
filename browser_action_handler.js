// Toggle enabled state on browser action button click
browser.browserAction.onClicked.addListener(async () => {
  const oldValue = (await browser.storage.local.get({"enabled": true}))["enabled"];
  browser.storage.local.set({"enabled": !oldValue});
});

// Change browser action button icon/label to match
async function updateButton() {
  const enabled = (await browser.storage.local.get({"enabled": true}))["enabled"];
  
  browser.browserAction.setTitle({
    title: enabled ? "Disable Edge Touch Pager" : "Enable Edge Touch Pager",
  });
  browser.browserAction.setIcon({
    path: enabled ? "icons/edge-touch-pager.svg" : "icons/edge-touch-pager-struck-out.svg",

  });
}

browser.storage.local.onChanged.addListener(updateButton);
updateButton();
