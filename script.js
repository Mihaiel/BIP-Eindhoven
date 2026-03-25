// Shared UI logic for page intro, reveal animations, navigation, and counters.
(function () {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const body = document.body;
  const loader = document.querySelector(".page-loader");
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav");
  const revealElements = document.querySelectorAll(".reveal");
  const counters = document.querySelectorAll("[data-count]");

  window.addEventListener("load", () => {
    window.setTimeout(() => {
      body.classList.add("page-ready");
      if (loader) {
        loader.classList.add("hidden");
      }
    }, prefersReducedMotion ? 0 : 420);
  });

  revealElements.forEach((element) => {
    const delay = element.dataset.delay ? Number(element.dataset.delay) : 0;
    element.style.setProperty("--reveal-delay", `${delay}ms`);
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });

    revealElements.forEach((element) => observer.observe(element));
  } else {
    revealElements.forEach((element) => element.classList.add("is-visible"));
  }

  const animateCounter = (element) => {
    const target = Number(element.dataset.count);
    if (!Number.isFinite(target)) {
      return;
    }

    const suffix = element.textContent.trim().replace(/[0-9]/g, "") || "%";
    const duration = prefersReducedMotion ? 0 : 1200;
    const startTime = performance.now();

    const frame = (timestamp) => {
      const progress = duration === 0 ? 1 : Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(target * eased);
      element.textContent = `${value}${suffix}`;
      if (progress < 1) {
        requestAnimationFrame(frame);
      }
    };

    requestAnimationFrame(frame);
  };

  if ("IntersectionObserver" in window) {
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach((counter) => counterObserver.observe(counter));
  } else {
    counters.forEach(animateCounter);
  }

  if (navToggle && nav) {
    navToggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("nav-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });
  }

  // Subtle parallax for prominent hero elements on capable devices.
  if (!prefersReducedMotion) {
    const parallaxTargets = document.querySelectorAll(".hero-device, .demo-stage");
    window.addEventListener("pointermove", (event) => {
      const x = (event.clientX / window.innerWidth - 0.5) * 10;
      const y = (event.clientY / window.innerHeight - 0.5) * 10;

      parallaxTargets.forEach((target) => {
        target.style.transform = `translate3d(${x * 0.35}px, ${y * 0.35}px, 0)`;
      });
    });
  }
})();
