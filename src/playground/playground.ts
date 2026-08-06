import ScratchRender from "../RenderWebGL";
import getMousePosition from "./getMousePosition";

const canvas = document.getElementById("scratch-stage")! as HTMLCanvasElement;
let fudge = 90;
const renderer = new ScratchRender(canvas);
renderer.setLayerGroupOrdering(["group1"]);
(window as any).render = renderer;

const drawableID = renderer.createDrawable("group1")!;
renderer.updateDrawableProperties(drawableID, {
  position: [0, 0],
  scale: [100, 100],
  direction: 90,
});

const WantedSkinType = {
  bitmap: "bitmap",
  vector: "vector",
  pen: "pen",
};

const drawableID2 = renderer.createDrawable("group1")!;
const wantedSkin = WantedSkinType.vector;

// Bitmap (squirrel)
const image = new Image();
image.addEventListener("load", () => {
  const bitmapSkinId = renderer.createBitmapSkin(image);
  if (wantedSkin === WantedSkinType.bitmap) {
    renderer.updateDrawableProperties(drawableID2, {
      skinId: bitmapSkinId,
    });
  }
});
image.crossOrigin = "anonymous";
image.src =
  "https://m.xiguacity.cn/user_projects_assets/9a8d068456c6e0cc5597342cb5ffcaad.png";

// SVG (cat 1-a)
const xhr = new XMLHttpRequest();
xhr.addEventListener("load", () => {
  const skinId = renderer.createSVGSkin(xhr.responseText);
  if (wantedSkin === WantedSkinType.vector) {
    renderer.updateDrawableProperties(drawableID2, {
      skinId: skinId,
    });
    //spector.stopCapture();
  }
});
xhr.open(
  "GET",
  "https://m.xiguacity.cn/user_projects_assets/fa07bb0dea8397e9452f427e817afde8.svg",
);
xhr.send();

if (wantedSkin === WantedSkinType.pen) {
  const penSkinID = renderer.createPenSkin();

  renderer.updateDrawableProperties(drawableID2, {
    skinId: penSkinID,
  });

  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    renderer.penLine(
      penSkinID,
      {
        color4f: [Math.random(), Math.random(), Math.random(), 1],
        diameter: 8,
      },
      x - 240,
      180 - y,
      Math.random() * 480 - 240,
      Math.random() * 360 - 180,
    );
  });
}

let posX = 0;
let posY = 0;
let scaleX = 100;
let scaleY = 100;
let fudgeProperty = "posx";

const fudgeInput = document.getElementById("fudge") as HTMLInputElement;
const fudgePropertyInput = document.getElementById(
  "fudgeproperty",
) as HTMLInputElement;
const fudgeMinInput = document.getElementById("fudgeMin") as HTMLInputElement;
const fudgeMaxInput = document.getElementById("fudgeMax") as HTMLInputElement;

/* eslint require-jsdoc: 0 */
const updateFudgeProperty = (event: any) => {
  fudgeProperty = event.target.value;
};

const updateFudgeMin = (event: any) => {
  fudgeInput.min = event.target.valueAsNumber;
};

const updateFudgeMax = (event: any) => {
  fudgeInput.max = event.target.valueAsNumber;
};

fudgePropertyInput.addEventListener("change", updateFudgeProperty);
fudgePropertyInput.addEventListener("init", updateFudgeProperty);

fudgeMinInput.addEventListener("change", updateFudgeMin);
fudgeMinInput.addEventListener("init", updateFudgeMin);

fudgeMaxInput.addEventListener("change", updateFudgeMax);
fudgeMaxInput.addEventListener("init", updateFudgeMax);

// Ugly hack to properly set the values of the inputs on page load,
// since they persist across reloads, at least in Firefox.
// The best ugly hacks are the ones that reduce code duplication!
fudgePropertyInput.dispatchEvent(new CustomEvent("init"));
fudgeMinInput.dispatchEvent(new CustomEvent("init"));
fudgeMaxInput.dispatchEvent(new CustomEvent("init"));
fudgeInput.dispatchEvent(new CustomEvent("init"));

const handleFudgeChanged = function (event: any) {
  fudge = event.target.valueAsNumber;
  const props: any = {};
  switch (fudgeProperty) {
    case "posx":
      props.position = [fudge, posY];
      posX = fudge;
      break;
    case "posy":
      props.position = [posX, fudge];
      posY = fudge;
      break;
    case "direction":
      props.direction = fudge;
      break;
    case "scalex":
      props.scale = [fudge, scaleY];
      scaleX = fudge;
      break;
    case "scaley":
      props.scale = [scaleX, fudge];
      scaleY = fudge;
      break;
    case "scaleboth":
      props.scale = [fudge, fudge];
      scaleX = fudge;
      scaleY = fudge;
      break;
    case "color":
      props.color = fudge;
      break;
    case "whirl":
      props.whirl = fudge;
      break;
    case "fisheye":
      props.fisheye = fudge;
      break;
    case "pixelate":
      props.pixelate = fudge;
      break;
    case "mosaic":
      props.mosaic = fudge;
      break;
    case "brightness":
      props.brightness = fudge;
      break;
    case "ghost":
      props.ghost = fudge;
      break;
  }
  renderer.updateDrawableProperties(drawableID2, props);
};

fudgeInput.addEventListener("input", handleFudgeChanged);
fudgeInput.addEventListener("change", handleFudgeChanged);
fudgeInput.addEventListener("init", handleFudgeChanged);

const updateStageScale = (event: any) => {
  renderer.resize(
    480 * event.target.valueAsNumber,
    360 * event.target.valueAsNumber,
  );
};

const stageScaleInput = document.getElementById(
  "stage-scale",
) as HTMLInputElement;

stageScaleInput.addEventListener("input", updateStageScale);
stageScaleInput.addEventListener("change", updateStageScale);

canvas.addEventListener("mousemove", (event) => {
  const mousePos = getMousePosition(event, canvas);
  renderer.extractColor(mousePos.x, mousePos.y, 30);
});

canvas.addEventListener("click", (event) => {
  const mousePos = getMousePosition(event, canvas);
  const pickID = renderer.pick(mousePos.x, mousePos.y) as number;
  console.log(`You clicked on ${pickID < 0 ? "nothing" : `ID# ${pickID}`}`);
  if (pickID >= 0) {
    console.dir(renderer.extractDrawableScreenSpace(pickID));
  }
  // renderer._gandiShaderManager.effectors.get('shake').shake(10, 10);
  // renderer._gandiShaderManager.effectors.get('shake').render();
  (renderer._gandiShaderManager.effectors.get("shockwave")! as any).drop(
    0.5,
    0.5,
    0.1,
    0.1,
    0.001,
    0.01,
  );
});

const drawStep = function () {
  renderer.draw();
  // renderer.getBounds(drawableID2);
  // renderer.isTouchingColor(drawableID2, [255,255,255]);
  requestAnimationFrame(drawStep);
};
drawStep();
// renderer._gandiShaderManager.register('shake');
// renderer._gandiShaderManager.effectors.get('shake').bypass = 0;

renderer._gandiShaderManager.register("bloom");
renderer._gandiShaderManager.effectors.get("bloom")!.bypass = !!0;

const debugCanvas = /** @type {canvas} */ document.getElementById(
  "debug-canvas",
) as HTMLCanvasElement;
renderer.setDebugCanvas(debugCanvas);
