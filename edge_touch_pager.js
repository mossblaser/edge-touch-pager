/**
 * This file contains the main implementation of Edge-Touch Pager and is a
 * content script which runs on all web pages.
 *
 * Jump to the end of the file for the 'main' function which sets everything
 * up.
 */

/**
 * Discover the height of any fixed headers (or footers if "bottom" given)
 * which overlap scrolled content.
 */
function discoverHeaderHeight(edge="top") {
  // There are two standard ways to make a header/footer which may obscure
  // content on the screen on scrolling: using position fixed and using
  // position sticky.
  //
  // In both cases, we only care about the case where the div in question is
  // touching the screen edge. When not touching the screen edge we assume that
  // the container is not a header/footer (e.g. a dialogue) or it is sticky and
  // hasn't hit the screen edge yet (and so isn't obscuring anything).
  //
  // Rather than performing a scan of all elements looking for sticky ones and
  // then computing their bounding box we just query the elements under a
  // single pixel at the top/bottom of the screen, sorted!
  const x = window.visualViewport.width / 2;
  // XXX: Presumably due to subpixel scrolling picking a coordinate at the
  // exact top or bottom of the screen is not robust, hence we sample the
  // pixels one row down or up from that.
  const y = edge == "top" ? 1 : (window.visualViewport.height - 1 - 1);
  let element = null;
  let position = null;
  for (const elem of document.elementsFromPoint(x, y)) {
    position = getComputedStyle(elem).position
    if (position == "sticky" || position == "fixed") {
      // NB: We continue searching for higher-up elements just in case we have
      // a fixed element within a larger fixed element.
      element = elem;
    }
  }
  if (element === null) {
    return 0;
  }

  // The position fixed case: easy: it always obscures the same amount of
  // scrolled content
  //
  // The sticky case is harder, at least in theory. For instance to work out
  // how much of the text it has overlapped during a scroll you need to know
  // how much its position has changed. For example there are three cases to
  // consider:
  //
  // (1) It has only just hit the top of the screen and so only a tiny bit of
  //     content has been obscured.
  //
  // (2) Once scrolled the full height of the header, a full header-worth of
  //     content is obscured.
  //
  // (3) If the container of the sticky header scrolls off the screen too, so
  //     will our header and so the amount of obscured content will diminish
  //     again.
  //
  // Fortunately the hardest case (case 1) can basically be ignored for this
  // application with a likely minimal impact on utility. The reason is that
  // since we are doing screenful-at-a-time scrolling, we're very unlikely to
  // find ourselves in a scroll position in this narrow window. Further, if we
  // do, the worst we'll do is not scroll as much as we can: we won't end up
  // skipping past anything.
  //
  // Case 3 is simillarly unlikely to crop up for much the same reason and in
  // any case, the failure rate will not lead to use missing content.
  //
  // The remaining case, 2, is just the same as position: fixed. As such we can
  // handle both styles of header the same! As a bonus, if the header hasn't
  // reached the edge of the screen yet we won't have found it in the step
  // above so case 1 doesn't apply there either!
  const rect = element.getBoundingClientRect();
  if (edge == "top") {
    return rect.height - rect.top;
  } else if (edge == "bottom") {
    return window.visualViewport.height - rect.top;
  }
}


/**
 * Pan the visual viewport by a given amount in CSS pixels.
 *
 * Returns a promise which resolves once the scroll has completed.
 *
 * NB: By contrast with window.scrollBy, this acts on the VisualViewport and
 * not the layout viewport and so works when the viewport is zoomed (and in
 * particular on non-mobile friendly pages).
 */
function scrollVisualViewportBy(dx, dy, smooth=false, retries=10) {
  return new Promise((resolve, reject) => {
    const x = window.visualViewport.pageLeft + dx;
    const y = window.visualViewport.pageTop + dy;
    
    // The trick to this function is to use scrollIntoView on a suitably placed
    // hidden element... Lets create/find that element...
    let target = document.getElementById("__scrollVisualViewportByTarget");
    if (target === null) {
      target = document.createElement("div");
      target.setAttribute("id", "__scrollVisualViewportByTarget");
      target.style.position = "absolute";
      target.style.visibility = "hidden";
      // NB: Must be put in the <html> element as <body> might not have its
      // origin at (0, 0)
      document.documentElement.appendChild(target);
    }
    
    target.style.top = `${y}px`;
    target.style.left = `${x}px`;
    
    // We'll scrollIntoView the top-left corner (in LTR writing systems) or
    // top-right corner (in RTL systems) so the width needs to match the viewport
    // to work in both systems.
    target.style.width = `${window.visualViewport.width}px`;
    // To avoid our scroll target enlarging the layout viewport as a side effect
    // of being placed at the bottom we must give it a zero height.
    target.style.height = "0";
    
    // Force reflow
    target.offsetHeight;
    
    // NB: On Firefox for Android, the scrollIntoView function *sometimes*
    // fails to work first (and second...) time round for reasons unknown. As a
    // workaround, we retry a few times.
    //
    // To be clear: this is *not* requireed to deal with smooth scrolling
    // causing the scroll to take some period of time: from the DOM's point of
    // view the scroll is always instant, eveen in smooth scrolling mode.
    function attemptScrollIntoView() {
      target.scrollIntoView({
        // NB 'instant' was changed to 'auto' in 2020 (see
        // https://drafts.csswg.org/cssom-view/#changes-from-2013-12-17) however
        // at the time of writing this, Firefox (at least) only doesn't seem to
        // have caught up with this so we use 'instant' instead.
        behavior: smooth ? "smooth" : "instant",
        block: "start",
        inline: "start",
      });
      worked = Math.abs(y - target.offsetTop) <= 1;
      
      if (worked) {
        resolve();
      } else {
        if (retries > 0) {;
          retries--;
          window.requestAnimationFrame(attemptScrollIntoView);
        } else {
          reject(new Error("Scrolling failed"));
        }
      }
    }
    attemptScrollIntoView();
  });
}

/**
 * Scroll the visual viewport by a screenful at a time.
 *
 * @param direction +ve to scroll down, -ve to scroll up. (Always scrolls one
 *                  screenful at a time: only the sign matters).
 * @param overlap Size of the overlap to leave after scrolling in CSS pixels
 *                (scaled to match the viewport zoom level).
 */
async function scrollByScreen(direction, overlap=38, smooth=false) {
  let scrollDistance = window.visualViewport.height;
  
  scrollDistance -= overlap / window.visualViewport.scale;
  
  // If not insane (e.g. covering whole screen), account for fixed headers/footers
  const headerSize = discoverHeaderHeight("top");
  const footerSize = discoverHeaderHeight("bottom");
  if (
    headerSize >= 0 &&
    footerSize >= 0 &&
    headerSize + footerSize < window.visualViewport.height * 0.5
  ) {
    scrollDistance -= headerSize;
    scrollDistance -= footerSize;
  }
  
  await scrollVisualViewportBy(0, Math.sign(direction) * scrollDistance, smooth);
  
  // If scrolling has caused the header to change height (e.g. a sticky div has
  // hit the top of the screen, or other Javascript shenanigans) then we should
  // scroll back up a little to uncover anything potentially hidden.
  let adjustment = 0;
  if (direction > 0) {
    const headerSizeAfter = discoverHeaderHeight("top")
    // Sanity check
    if (
      headerSizeAfter >= 0 &&
      headerSizeAfter < window.visualViewport.height * 0.5
    ) {
      adjustment -= headerSizeAfter - headerSize;
    }
  } else if (direction < 0) {
    const footerSizeAfter = discoverHeaderHeight("bottom")
    // Sanity check
    if (
      footerSizeAfter >= 0 &&
      footerSizeAfter < window.visualViewport.height * 0.5
    ) {
      adjustment += footerSizeAfter - footerSize;
    }
  }
  
  if (adjustment != 0) {
    await scrollVisualViewportBy(0, adjustment);
  }
}

/**
 * Scroll the visual viewport such that a given page coordinate ends up at the
 * top of the screen.
 *
 * @param newPageTop The page coordinate to scroll to the top of the viewport.
 * @param overlap Size of the under-scroll in CSS pixels to leave
 *                (scaled to match the viewport zoom level).
 */
async function scrollPointToTop(newPageTop, overlap=19, smooth=false) {
  let scrollDistance = newPageTop - window.visualViewport.pageTop;
  
  scrollDistance -= overlap / window.visualViewport.scale;
  
  // If not insane (e.g. covering whole screen), account for fixed headers
  const headerSize = discoverHeaderHeight("top");
  if (headerSize >= 0 && headerSize < window.visualViewport.height * 0.5) {
    scrollDistance -= headerSize;
  }
  
  await scrollVisualViewportBy(0, scrollDistance, smooth);
  
  // If scrolling has caused the header to change height (e.g. a sticky div has
  // hit the top of the screen, or other Javascript shenanigans) then we should
  // scroll back up a little to uncover anything potentially hidden.
  const headerSizeAfter = discoverHeaderHeight("top")
  // Sanity check
  if (headerSizeAfter >= 0 && headerSizeAfter < window.visualViewport.height * 0.5) {
    const adjustment = headerSize - headerSizeAfter;
    if (adjustment != 0) {
      await scrollVisualViewportBy(0, adjustment);
    }
  }
}

/**
 * Scroll the visual viewport such that a given page coordinate ends up at the
 * bottom of the screen.
 *
 * @param newPageBottom The page coordinate to scroll to the bottom of the viewport.
 * @param overlap Size of the under-scroll in CSS pixels to leave
 *                (scaled to match the viewport zoom level).
 */
async function scrollPointToBottom(newPageBottom, overlap=19, smooth=false) {
  let scrollDistance = newPageBottom - (
    window.visualViewport.pageTop + window.visualViewport.height
  );
  
  scrollDistance += overlap / window.visualViewport.scale;
  
  // If not insane (e.g. covering whole screen), account for fixed headers
  const footerSize = discoverHeaderHeight("bottom");
  if (footerSize >= 0 && footerSize < window.visualViewport.height * 0.5) {
    scrollDistance += footerSize;
  }
  await scrollVisualViewportBy(0, scrollDistance, smooth);
  
  // If scrolling has caused the header to change height (e.g. a sticky div has
  // hit the top of the screen, or other Javascript shenanigans) then we should
  // scroll back up a little to uncover anything potentially hidden.
  const footerSizeAfter = discoverHeaderHeight("bottom")
  // Sanity check
  if (footerSizeAfter >= 0 && footerSizeAfter < window.visualViewport.height * 0.5) {
    const adjustment = footerSizeAfter - footerSize;
    if (adjustment != 0) {
      await scrollVisualViewportBy(0, adjustment);
    }
  }
}


/**
 * Setup an event listener for the scroll and resize events of the
 * visualViewport, rate limited to one call per frame.
 *
 * Returns a function which removes the event listener again.
 */
function onVisualViewportChange(f) {
  let scheduled = false;
  const wrapper = (evt) => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        f(evt);
      });
    }
  };
  window.visualViewport.addEventListener("scroll", wrapper);
  window.visualViewport.addEventListener("resize", wrapper);
  
  return () => {
    window.visualViewport.removeEventListener("scroll", wrapper);
    window.visualViewport.removeEventListener("resize", wrapper);
  }
}

/**
 * Get a div whose dimensions match the layout viewport.
 */
function getLayoutViewport() {
  let div = document.getElementById("__getLayoutViewport");
  if (div === null) {
    div = document.createElement("div");
    div.setAttribute("id", "__getLayoutViewport")
    div.style.position = "fixed";
    div.style.width = "100%";
    div.style.height = "100%";
    div.style.visibility = "hidden";
    document.documentElement.appendChild(div);
  }
  return div;
}


/**
 * Create a bar along the edge of the screen which can intercept touches which
 * remains at the same size regardless of the visual viewport's zoom and pan.
 *
 * @param side One of "left" or "right"
 * @param width The CSS width of the bar
 * @param debug If true, makes the bar visible, otherwise it remains invisible.
 * @returns the element and a function which removes the edge bar again.
 */
function createEdgeBar(side, width="1cm", debug=false) {
  const div = document.createElement("div");
  
  div.style.position = "fixed";
  div.style[side] = "0";
  div.style.top = "0";
  div.style.width = width;
  div.style.zIndex = 99999;
  
  if (debug) {
    console.log("Edge touch pager running in debug mode");
    // Make edge zone visible
    div.style.opacity = "0.5";
    div.style.backgroundColor = "red";
    div.style.color = "yellow";
  } else {
    // NB: The apparently excessive level of insistance on transparency here is
    // required to make sure that the buttons don't become visible under the
    // influence of DarkReader.
    div.style.backgroundColor = "transparent !important";
    div.style.opacity = "0.0";
  }
  
  document.documentElement.appendChild(div);
  
  // Scale (and resize) the bar to match the current visual viewport zoom/pan.
  const handleViewportChange = () => {
    const scale = 1 / window.visualViewport.scale;
    const ty = window.visualViewport.offsetTop;
    
    let tx = 0;
    if (side == "left") {
      tx = window.visualViewport.offsetLeft;
    } else if (side == "right") {
      tx = -(
        getLayoutViewport().clientWidth - 
        (window.visualViewport.offsetLeft + window.visualViewport.width)
      );
    }
    
    div.style.transformOrigin = `top ${side}`;
    div.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    
    div.style.height = `${(window.visualViewport.height * window.visualViewport.scale)}px`;
  };
  const removeEventListeners = onVisualViewportChange(handleViewportChange);
  handleViewportChange();
  
  const cleanup = () => {
    removeEventListeners();
    div.remove();
  };
  
  return [div, cleanup];
}

/**
 * Creates and dispatches a synthetic click event at the given layout viewport
 * coordinate, excluding the 'ignoredElem' element in considering what to
 * click.
 */
function clickThrough(ignoredElem, clientX, clientY) {
  const els = document.elementsFromPoint(clientX, clientY);
  let target;
  for (const candidate of els) {
    if (candidate != ignoredElem) {
      target = candidate;
      break;
    }
  }
  
  const evt = new MouseEvent("click", {
    view: window,
    bubbles: true,
    cancelable: true,
  });
  
  target.dispatchEvent(evt);
}


/**
 * Call a function after the given delay in ms. Returns a function which may be
 * called to cancel the callback (if it has not already occurred). Just a
 * slightly nicer wrapper around `setTimeout`...
 */
function callAfter(delay, callback) {
  let id = window.setTimeout(
    () => {
      id = null;
      callback();
    },
    delay
  );
  
  return () => {
    if (id !== null) {
      window.clearTimeout(id);
      id = null;
    }
  };
}


/**
 * Setup callbacks for various simple gestures on the edge bars.
 *
 * @param elem The element to add listeners to
 * @param press|longPress Called on a normal or long press-and-release
 *        (respectively) with client coordinates of the start of the press as a
 *        2-array as argument.
 * @param swipeUp|swipeDown Called on a swipe up or down (respectively) with
 *        the client coordinates of the start and end of the gesture as two
 *        2-arrays.
 * @param config.pressMovementLimit The maximum number of CSS pixels the
 *        touch/mouse can move during a (short or long) press.
 * @param config.longPressDuration The duration of a long-press (ms).
 * @param config.dragDistanceThreshold The minimum number of CSS pixels the
 *        touch/mouse must move to constitute a drag.
 * @param config.dragAngleThreshold The maximum number of radians a drag can
 *        deviate from the vertical.
 * @returns A function which removes all event listeners again.
 */
function captureGestures(
  elem,
  press,
  longPress,
  swipeUp,
  swipeDown,
  {
    pressMovementLimit = 18, // 0.5 cm,
    longPressDuration = 500,
    dragDistanceThreshold = 38 * 2,  // 2 cm
    dragAngleThreshold = Math.PI / 4,
  }={},
) {
  // Start and end coordinates of the most recent drag.
  let startCoord;
  let endCoord;
  
  const dragDistance = () => Math.sqrt(
    Math.pow(endCoord[0] - startCoord[0], 2) +
    Math.pow(endCoord[1] - startCoord[1], 2)
  ) * window.visualViewport.scale;
  const dragAngle = () => Math.atan2(
    endCoord[1] - startCoord[1],
    endCoord[0] - startCoord[0],
  );
  
  // Function to cancel an ongoing long-press timer
  let cancelLongPressTimer = () => {};
  
  // Movement -> Gesture logic
  const onStart = (coord) => {
    startCoord = endCoord = coord;
    
    cancelLongPressTimer();
    cancelLongPressTimer = callAfter(longPressDuration, () => {
      if (dragDistance() < pressMovementLimit) {
        longPress(startCoord);
        startCoord = null;
      }
    });
  };
  const onMove = (coord) => {
    endCoord = coord;
  };
  const onEnd = (coord) => {
    if (startCoord === null) {
      return;
    }
    endCoord = coord;
    cancelLongPressTimer();
    
    if (dragDistance() > dragDistanceThreshold) {
      if (Math.abs(dragAngle() - (Math.PI / 2)) < dragAngleThreshold) {
        swipeDown(startCoord, endCoord);
      } else if (Math.abs(dragAngle() - (-Math.PI / 2)) < dragAngleThreshold) {
        swipeUp(startCoord, endCoord);
      }
    } else if (dragDistance() < pressMovementLimit) {
      press(startCoord);
    }
    
    startCoord = null;
  };
  
  // Touch event handling (just follow first finger)
  elem.style.touchAction = "none";
  let touchIdentifier = null;
  const touchstart = (evt) => {
    evt.stopPropagation();
    evt.preventDefault();
    const touch = evt.touches[0];
    touchIdentifier = touch.identifier;
    onStart([touch.clientX, touch.clientY]);
  };
  const touchmove = (evt) => {
    evt.stopPropagation();
    evt.preventDefault();
    let found = false;
    for (const touch of evt.changedTouches) {
      if (touch.identifier === touchIdentifier) {
        onMove([touch.clientX, touch.clientY]);
        found = true;
        break;
      }
    }
    if (!found) {
      onEnd(endCoord);
      touchIdentifier = null;
    }
  };
  const touchend = (evt) => {
    evt.stopPropagation();
    evt.preventDefault();
    for (const touch of evt.changedTouches) {
      if (touch.identifier === touchIdentifier) {
        onEnd([touch.clientX, touch.clientY]);
        break;
      }
    }
  };
  elem.addEventListener("touchstart", touchstart);
  elem.addEventListener("touchmove", touchmove);
  elem.addEventListener("touchend", touchend);
  
  // Mouse event handling
  const mousedown = (evt) => {
    evt.stopPropagation();
    evt.preventDefault();
    onStart([evt.clientX, evt.clientY]);
  };
  const mousemove = (evt) => {
    evt.stopPropagation();
    evt.preventDefault();
    onMove([evt.clientX, evt.clientY]);
  };
  const mouseup = (evt) => {
    evt.stopPropagation();
    evt.preventDefault();
    onEnd([evt.clientX, evt.clientY]);
  };
  elem.addEventListener("mousedown", mousedown);
  elem.addEventListener("mousemove", mousemove);
  elem.addEventListener("mouseup", mouseup);
  
  return () => {
    elem.removeEventListener("touchstart", touchstart);
    elem.removeEventListener("touchmove", touchmove);
    elem.removeEventListener("touchend", touchend);
    
    elem.removeEventListener("mousedown", mousedown);
    elem.removeEventListener("mousemove", mousemove);
    elem.removeEventListener("mouseup", mouseup);
  };
}


/**
 * Create (invisible) edge touch paging buttons.
 *
 * @param config.buttonWidth The width of the edge touch areas in CSS pixels.
 * @param config.screenfulUnderscroll The number of CSS pixels short of a
 *        screenful to scroll by when clicked.
 * @param config.toEdgeUnderscroll The number of CSS pixels short of the target
 *        position to scroll when scrolling a point to the top/bottom of the
 *        screen.
 * @param config.longPressDuration Long press (click-through) duration in ms.
 * @param config.smooth Enable smooth scrolling animation.
 * @param config.debug Make the edge bars visible.
 * @returns A function which removes the buttons again.
 */
function addEdgeScrollButtons({
  buttonWidth = 38,  // 1cm
  screenfulUnderscroll = 38,  // 1cm
  toEdgeUnderscroll = 19,  // 5mm
  longPressDuration = 500,  // ms
  smooth = false,
  debug = false,
}={}) {
  const cleanupFunctions = [];
  for (let [side, direction] of [["left", -1], ["right", 1]]) {
    const [edgeBar, removeEdgeBar] = createEdgeBar(side, `${buttonWidth}px`, debug);
    const uncaptureGestures = captureGestures(
      edgeBar,
      // Press
      () => scrollByScreen(direction, screenfulUnderscroll, smooth),
      // Long press
      ([clientX, clientY]) => clickThrough(edgeBar, clientX, clientY),
      // Swipe up
      ([clientX, clientY]) => scrollPointToTop(window.scrollY + clientY, toEdgeUnderscroll, smooth),
      // Swipe down
      ([clientX, clientY]) => scrollPointToBottom(window.scrollY + clientY, toEdgeUnderscroll, smooth),
      {longPressDuration},
    );
    cleanupFunctions.push(removeEdgeBar);
    cleanupFunctions.push(uncaptureGestures);
  }
  
  return () => {
    for (const f of cleanupFunctions) {
      f();
    }
  };
}

/**
 * Setup a keyboard handler for the page down and page up keys which uses our
 * scrolling logic rather than the browser's native mode.
 *
 * @param config.screenfulUnderscroll The number of CSS pixels short of a
 *        screenful to scroll by.
 * @param config.smooth Enable smooth scrolling animation.
 * @returns Function to call to disable this keyboard handler again.
 */
function addKeyboardHandler({
  screenfulUnderscroll = 38,  // 1cm
  smooth = false,
}={}) {
  const handler = (evt) => {
    if (evt.key === "PageDown") {
      evt.preventDefault();
      evt.stopPropagation();
      scrollByScreen(+1, screenfulUnderscroll, smooth);
    } else if (evt.key === "PageUp") {
      evt.preventDefault();
      evt.stopPropagation();
      scrollByScreen(-1, screenfulUnderscroll, smooth);
    }
  }
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}

// Start of world!
(function main() {
  // A function to call to remove any existing keyboard/edge buttons.
  let cleanup = () => {};

  // Whenever config changes, rip out all existing paging stuff and start again
  async function reloadConfig() {
    const defaults = await (await fetch(browser.runtime.getURL("defaults.json"))).json();
    const {
      enabled,
      edgeButtonsEnabled,
      keyboardEnabled,
      buttonWidth,
      screenfulUnderscroll,
      toEdgeUnderscroll,
      longPressDuration,
      smooth,
    } = Object.assign({}, defaults, await browser.storage.local.get(null));
    
    cleanup();
    
    if (enabled) {
      const cleanupFunctions = [];
      
      if (edgeButtonsEnabled) {
        cleanupFunctions.push(addEdgeScrollButtons({
          buttonWidth,
          screenfulUnderscroll,
          toEdgeUnderscroll,
          longPressDuration,
          smooth,
        }));
      }
      if (keyboardEnabled) {
        cleanupFunctions.push(addKeyboardHandler({
          screenfulUnderscroll,
          smooth,
        }));
      }
      
      cleanup = () => {
        for (const f of cleanupFunctions) {
          f();
        }
        cleanup = () => {};
      };
    }
  }

  browser.storage.local.onChanged.addListener(reloadConfig);
  reloadConfig();
})();
