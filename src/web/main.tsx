import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";

const elem = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// Keep one root across hot reloads.
type HotData = { root?: Root };
if (import.meta.hot) ((import.meta.hot.data as HotData).root ??= createRoot(elem)).render(app);
else createRoot(elem).render(app);
