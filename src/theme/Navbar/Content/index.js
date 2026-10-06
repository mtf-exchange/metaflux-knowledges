import React from 'react';
import {useThemeConfig} from '@docusaurus/theme-common';
import {useNavbarMobileSidebar} from '@docusaurus/theme-common/internal';
import NavbarItem from '@theme/NavbarItem';
import NavbarColorModeToggle from '@theme/Navbar/ColorModeToggle';
import SearchBar from '@theme/SearchBar';
import NavbarMobileSidebarToggle from '@theme/Navbar/MobileSidebar/Toggle';
import NavbarLogo from '@theme/Navbar/Logo';
import NavbarSearch from '@theme/Navbar/Search';

// Two rows: the brand and the search box, then the section tabs.
export default function NavbarContent() {
  const mobileSidebar = useNavbarMobileSidebar();
  const {items} = useThemeConfig().navbar;
  return (
    <>
      <div className="navbar__inner">
        <div className="navbar__items">
          {!mobileSidebar.disabled && <NavbarMobileSidebarToggle />}
          <NavbarLogo />
        </div>
        <div className="navbar__items navbar__items--right">
          <NavbarSearch>
            <SearchBar />
          </NavbarSearch>
        </div>
      </div>
      <div className="navbar__tabs">
        <div className="navbar__items">
          {items.map((item, i) => (
            <NavbarItem key={i} {...item} />
          ))}
        </div>
        <NavbarColorModeToggle />
      </div>
    </>
  );
}
