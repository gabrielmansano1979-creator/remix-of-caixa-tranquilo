import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/repasses")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
