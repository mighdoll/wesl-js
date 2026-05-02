import { render } from "preact";
import { App } from "./App.tsx";
import { CallbackScreen } from "./components/Callback.tsx";
import "./styles/app.css";

const root = document.getElementById("app")!;
if (location.pathname === "/auth/callback") {
  render(<CallbackScreen />, root);
} else {
  render(<App />, root);
}
