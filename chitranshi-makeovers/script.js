document.getElementById("whatsappBtn").addEventListener("click", function() {
        const phoneNumber = "+917735143792"; // Replace with your WhatsApp number
        const message = "Hi! Can i get more info about your makeup services.";
        window.open(`https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`, "_blank");
    });