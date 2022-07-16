Edge-Touch Pager
================

![Edge-Touch Pager Logo](icons/edge-touch-pager.svg)

A Firefox add-on which lets you scroll through web pages by touching the edges
of the screen -- ideal for ereaders, tablets and phones.


Basic usage
-----------

Tap the right edge of the screen to Scroll down by one screenful. Tap the left
edge to scroll up.

Swipe up on either edge of the screen to scroll part of the page to the top of
the screen. Swipe down to move it to the bottom.

Press and hold to click on parts of the page near the edges of the screen
instead of scrolling.

Edge-touch pager also overrides your page-up and page-down keys by default to
use its improved scrolling behaviour.


Bonus eink browsing tip
-----------------------

The excellent [Dark Reader](https://darkreader.org/) add-on can also be
configured to force all web pages to use a high-contrast
black-text-on-white-background ideal for eink screens. Together with Edge-Touch
Pager it makes for an excellent web reading experience.



Why is there so much code?
--------------------------

This plugin was originally inspired by [rbauduin's ereaderify
add-on](https://gitlab.com/rbauduin/ereaderify). The very first version, like
ereaderify, was incredibly simple: just [21 lines of
code](https://github.com/mossblaser/edge-touch-pager/blob/v0.1/edge_touch_pager.js).
And it worked. Sort of.

Unfortunately, the simple act of scrolling through a webpage is much (much)
harder than it seems:

* Some web pages include headers and footers which overlap page content meaning
  that some text may be obscured if you scroll by a whole screenful at once.
  Sometimes these even change size or disappear as you scroll.
* The touch-sensitive areas at the edges of the screen sometimes got in the way
  of things you want to click and so you need a way to click through to them
  which didn't involve disabling the add-on and reloading the page.
* On mobile devices, zooming into a page (or just viewing any non-mobile
  optimised page), made the (invisible) touch-sensitive buttons disappear off
  the edge of the screen.
* Even if the buttons didn't disappear, on mobile devices, the [normal
  scrolling
  APIs](https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollBy) just
  don't work correctly because they manipulate the ['layout
  viewport'](https://developer.mozilla.org/en-US/docs/Glossary/Layout_viewport)
  which only loosely relates to the [visual
  viewport](https://developer.mozilla.org/en-US/docs/Glossary/Visual_Viewport)
  which actually defines what you see on a mobile device.
* Finally, sometimes you don't want to scroll a full screenful anyway: maybe
  you just wanted to scroll some figure to the top of the screen so you can see
  the whole of it at once. While you can just scroll manually on a phone or
  tablet, on an eink device doing this is a smeary, laggy and error-prone task.
  Wouldn't it be nice if there was a gesture available to do that?

All this is why Edge-Touch Pager is now hundreds of lines long. If you're
curious (in the manner one is when passing a car crash), take a peek [at the
comments in the source code](edge_touch_pager.js) to see what it takes.

