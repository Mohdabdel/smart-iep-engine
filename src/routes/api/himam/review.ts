import { createFileRoute } from "@tanstack/react-router";
import { handleHimamSyntheticReviewRequest } from "@/lib/himam-http-service.server";

export const Route = createFileRoute("/api/himam/review")({
  server: {
    handlers: {
      POST: async ({ request }) => handleHimamSyntheticReviewRequest(request),
    },
  },
});
