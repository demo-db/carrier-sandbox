// Worker entry: workerd accepts only handlers as exports of the entry module, so the contract
// logic and its named exports live in ./sandbox.js.
import { makeHandler, route } from "./sandbox.js";

export default makeHandler(route);
