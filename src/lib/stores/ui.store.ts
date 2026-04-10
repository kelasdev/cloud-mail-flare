import { writable } from 'svelte/store';

const defaultSidebarCollapsed =
  typeof window !== 'undefined' ? window.matchMedia('(max-width: 960px)').matches : false;

export const sidebarCollapsed = writable(defaultSidebarCollapsed);
export const darkMode = writable(false);

if (typeof window !== 'undefined') {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  darkMode.set(isDark);

  darkMode.subscribe((val) => {
    if (val) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  });
}
