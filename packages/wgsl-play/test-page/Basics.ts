import type { WgslEdit } from "../../wgsl-edit/src/WgslEdit.ts";
import type { WgslPlay } from "../src/index.ts";
import { expose } from "./Shared.ts";

const basicPlayer = document.querySelector<WgslPlay>("#basicPlayer")!;

const conditionsPlayer = document.querySelector<WgslPlay>("#conditionsPlayer")!;
const conditionsSource = document.querySelector<WgslEdit>("#conditionsSource")!;
document.querySelector("#load-red-condition")!.addEventListener("click", () => {
  conditionsSource.conditions = { RED: true };
});

const autoplayOffPlayer =
  document.querySelector<WgslPlay>("#autoplayOffPlayer")!;

expose({ basicPlayer, conditionsPlayer, conditionsSource, autoplayOffPlayer });
