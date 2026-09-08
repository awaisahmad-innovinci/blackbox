import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  APP_NAV_SECTIONS,
  matchAppNavShortcut,
  matchGlobalNavShortcut,
  matchGlobalTaxonomyShortcut,
  matchNavDropdownItem,
  type NavDropdownId,
  type TaxonomyKind,
} from "./app-nav-keyboard";

export function useAppNavKeyboard({
  openNavDropdown,
  setOpenNavDropdown,
  onGlobalTaxonomyShortcut,
}: {
  openNavDropdown: NavDropdownId | null;
  setOpenNavDropdown: Dispatch<SetStateAction<NavDropdownId | null>>;
  onGlobalTaxonomyShortcut?: (kind: TaxonomyKind) => void;
}) {
  const navigate = useNavigate();
  const navRefs = useRef<(HTMLElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const initialFocusDone = useRef(false);

  const setNavRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      navRefs.current[index] = el;
    },
    [],
  );

  const focusNavIndex = useCallback((index: number) => {
    const count = APP_NAV_SECTIONS.length;
    const next = ((index % count) + count) % count;
    setActiveIndex(next);
    navRefs.current[next]?.focus();
  }, []);

  useEffect(() => {
    if (initialFocusDone.current) return;
    initialFocusDone.current = true;
    requestAnimationFrame(() => focusNavIndex(0));
  }, [focusNavIndex]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const sectionId = matchAppNavShortcut(event);
      if (sectionId) {
        const index = APP_NAV_SECTIONS.findIndex((s) => s.id === sectionId);
        const section = APP_NAV_SECTIONS[index];
        if (!section) return;

        if (section.kind === "link") {
          setOpenNavDropdown(null);
          navigate(section.to);
        } else {
          setOpenNavDropdown(section.dropdownId);
        }

        requestAnimationFrame(() => focusNavIndex(index));
        return;
      }

      const taxonomyKind = matchGlobalTaxonomyShortcut(event);
      if (taxonomyKind) {
        onGlobalTaxonomyShortcut?.(taxonomyKind);
        return;
      }

      const navTo = matchGlobalNavShortcut(event);
      if (navTo) {
        setOpenNavDropdown(null);
        navigate(navTo);
        return;
      }

      const to = matchNavDropdownItem(event, openNavDropdown);
      if (to) {
        setOpenNavDropdown(null);
        navigate(to);
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [navigate, focusNavIndex, setOpenNavDropdown, openNavDropdown, onGlobalTaxonomyShortcut]);

  const handleMenubarKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        focusNavIndex(activeIndex + 1);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        focusNavIndex(activeIndex - 1);
      }
    },
    [activeIndex, focusNavIndex],
  );

  const onNavFocus = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  return {
    activeIndex,
    setNavRef,
    handleMenubarKeyDown,
    onNavFocus,
  };
}
