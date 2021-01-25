const TOUCH_WIDTH_PERC = 5;

for (let [left, delta] of [["0vw", -1], [`${100 - TOUCH_WIDTH_PERC}vw`, 1]]) {
  const div = document.createElement("div");
  
  div.style.position = "fixed";
  div.style.left = left;
  div.style.top = "0";
  div.style.height = "100vh";
  div.style.width = `${TOUCH_WIDTH_PERC}vw`;
  div.style.zIndex = 99999;
  div.style.opacity = 0;
  
  div.addEventListener("click", (e) => {
    window.scrollByPages(delta);
    e.stopPropagation();
    e.preventDefault();
  })
  
  document.body.appendChild(div);
}
