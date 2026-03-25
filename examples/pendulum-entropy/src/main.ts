/// <reference types="wesl-plugin/suffixes" />
import "wgsl-play";
import "wgsl-edit";
import "../style.css";
import shaderProject from "../shaders/pendulum-entropy.wesl?link";

const editor = document.querySelector<any>("wgsl-edit")!;
const player = document.querySelector<any>("wgsl-play")!;

editor.project = shaderProject;

// Connect player to editor for live updates
player.setAttribute("source", "editor");
