import { Link } from "@tanstack/react-router";
import appIcon from "@/assets/app-icon-v2.png.asset.json";

export function Logo({ to = "/" }: { to?: "/" | "/caixa" }) {
  return (
    <Link to={to} className="flex items-center gap-2 font-semibold tracking-tight">
      <img
        src={appIcon.url}
        alt=""
        width={512}
        height={512}
        className="h-10 w-10 shrink-0 object-contain"
      />
      <span className="text-[15px] font-bold tracking-tight">Critical Cash</span>
    </Link>
  );
}
