const menuButton = document.querySelector(".menu-button");
const nav = document.querySelector(".site-nav");

if (menuButton && nav) {
  menuButton.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
    document.body.classList.toggle("menu-open", isOpen);
  });

  nav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      nav.classList.remove("is-open");
      menuButton.setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-open");
    }
  });
}

const dialog = document.querySelector(".photo-dialog");
const dialogImage = dialog?.querySelector("img");
const dialogTitle = dialog?.querySelector("h2");
const closeButton = dialog?.querySelector(".dialog-close");

document.querySelectorAll(".gallery-item").forEach((button) => {
  button.addEventListener("click", () => {
    const image = button.querySelector("img");
    if (!dialog || !dialogImage || !dialogTitle || !image) {
      return;
    }

    dialogTitle.textContent = button.dataset.title || "Recent job photo";
    dialogImage.src = image.src;
    dialogImage.alt = image.alt;
    dialog.showModal();
  });
});

closeButton?.addEventListener("click", () => dialog?.close());

dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) {
    dialog.close();
  }
});
