import type { Instrumentation } from "next";
import { serverFailureEvent } from "@/lib/operations/logging";

export const onRequestError: Instrumentation.onRequestError = (
  error,
  _request,
  context,
) => {
  console.error(JSON.stringify(serverFailureEvent(error, context)));
};
