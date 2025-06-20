fetch("http://192.168.0.103:8080/status.json")
  .then(res => res.json())
  .then(data => {
    document.getElementById("timestamp").textContent = "Last Updated: " + data.timestamp;
    document.getElementById("message").textContent = data.message;
    document.getElementById("status").textContent = "Status: " + data.status;
  })
  .catch(() => {
    document.getElementById("message").textContent = "Error loading status.";
  });
