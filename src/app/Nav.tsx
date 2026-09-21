import { BookOpen, Home, MoreHorizontal, Rows3 } from "lucide-react";
import { NavLink } from "react-router-dom";
import nav from "./Nav.module.css";

const LINKS = [
  { to: "/", label: "Сегодня", Icon: Home },
  { to: "/lessons", label: "Уроки", Icon: BookOpen },
  { to: "/words", label: "Слова", Icon: Rows3 },
  { to: "/more", label: "Ещё", Icon: MoreHorizontal },
];
export function Nav() {
  return (
    <nav className={nav.nav} aria-label="Основные разделы">
      <div className={nav.inner}>
        {LINKS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className={nav.link}>
            {({ isActive }) => (
              <>
                <Icon size={22} strokeWidth={isActive ? 2.4 : 1.9} aria-hidden />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
