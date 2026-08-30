/**
 * Kangro Theme Controller
 * Manages Light / Dark mode persistence across all Kangro pages.
 */
(function() {
    const STORAGE_KEY = "kangro-theme";

    function applyTheme(theme) {
        if (theme === "dark") {
            document.documentElement.classList.add("dark");
            if (document.body) document.body.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
            if (document.body) document.body.classList.remove("dark");
        }
    }

    // Initialize immediately to prevent theme flash
    const savedTheme = localStorage.getItem(STORAGE_KEY) || "light";
    applyTheme(savedTheme);

    document.addEventListener("DOMContentLoaded", function() {
        applyTheme(localStorage.getItem(STORAGE_KEY) || "light");

        const toggleBtn = document.getElementById("themeToggle");
        if (toggleBtn) {
            toggleBtn.addEventListener("click", function(e) {
                e.preventDefault();
                const isDark = document.body ? document.body.classList.contains("dark") : document.documentElement.classList.contains("dark");
                const newTheme = isDark ? "light" : "dark";
                applyTheme(newTheme);
                localStorage.setItem(STORAGE_KEY, newTheme);
            });
        }
    });

    window.KangroTheme = {
        get: function() {
            return localStorage.getItem(STORAGE_KEY) || "light";
        },
        set: function(theme) {
            applyTheme(theme);
            localStorage.setItem(STORAGE_KEY, theme);
        },
        toggle: function() {
            const isDark = (localStorage.getItem(STORAGE_KEY) || "light") === "dark";
            const newTheme = isDark ? "light" : "dark";
            applyTheme(newTheme);
            localStorage.setItem(STORAGE_KEY, newTheme);
            return newTheme;
        }
    };
})();