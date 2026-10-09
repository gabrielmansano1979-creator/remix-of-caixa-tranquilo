import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/parceiro")({
  beforeLoad: () => {
    throw redirect({ to: "/contador" });
  },
});
