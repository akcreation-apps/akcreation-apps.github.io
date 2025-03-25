document.addEventListener("DOMContentLoaded", function () {
    // WhatsApp Button
    const whatsappBtn = document.getElementById("whatsappBtn");
    if (whatsappBtn) {
        whatsappBtn.addEventListener("click", function () {
            const phoneNumber = "+917682904911";
            const message = "Hi! Can I get more info about your makeup services ?";
            location.href = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
        });
    }

    // Full-Screen Image View
    const galleryImages = document.querySelectorAll(".gallery-img");
    const fullscreenView = document.getElementById("fullscreenView");
    const fullscreenImage = document.getElementById("fullscreenImage");
    const closeFullscreen = document.getElementById("closeFullscreen");

    if (galleryImages.length > 0 && fullscreenView && fullscreenImage && closeFullscreen) {
        galleryImages.forEach(img => {
            img.addEventListener("click", function () {
                fullscreenImage.src = this.src;
                fullscreenView.style.display = "flex";
            });
        });

        closeFullscreen.addEventListener("click", function () {
            fullscreenView.style.display = "none";
        });

        fullscreenView.addEventListener("click", function (e) {
            if (e.target !== fullscreenImage) {
                fullscreenView.style.display = "none";
            }
        });
    }

    document.getElementById("hair-style").addEventListener("click", function() {
        window.location.href = "hair-styles.html"; // Change this to your actual home page URL
    });

    document.getElementById("bridal-makeup").addEventListener("click", function() {
        window.location.href = "bridal.html"; // Change this to your actual home page URL
    });

    let index = 0;
    const slider = document.querySelector(".testimonial-slider");
    const testimonials = document.querySelectorAll(".testimonial");
    const dotsContainer = document.querySelector(".slider-dots");

    // Create navigation dots
    testimonials.forEach((_, i) => {
        const dot = document.createElement("span");
        dot.addEventListener("click", () => moveToSlide(i));
        dotsContainer.appendChild(dot);
    });

    const dots = document.querySelectorAll(".slider-dots span");
    function moveToSlide(i) {
        index = i;
        slider.style.transform = `translateX(-${i * 100}%)`;
        updateDots();
    }

    function updateDots() {
        dots.forEach(dot => dot.classList.remove("active"));
        dots[index].classList.add("active");
    }

    function autoSlide() {
        index = (index + 1) % testimonials.length;
        moveToSlide(index);
    }

    dots[0].classList.add("active");
    setInterval(autoSlide, 7000); // Change slide every 4 seconds

    <!-- Countdown Timer Script -->
    const openingDate = new Date("2025-05-01T00:00:00").getTime(); // Set opening date

    function updateCountdown() {
        const now = new Date().getTime();
        const timeLeft = openingDate - now;

        if (timeLeft > 0) {
            const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
            document.getElementById("countdown").innerText = `${days} days`;
        } else {
            document.getElementById("follow-us").style.display = "";
            document.getElementById("countdown-section").style.display = "none";
        }
    }

    // Run immediately and then every second
    updateCountdown();
    setInterval(updateCountdown, 1000);

});
