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
