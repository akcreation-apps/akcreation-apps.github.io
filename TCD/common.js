function get_dish_url(dish_name) {
    // Split the string into words by spaces, then join with an underscore
    return 'src/'+dish_name.split(' ').join('_')+'.png';
}

async function get_credentials() {
    try {
        // Fetch the JSON file
        const response = await fetch(`credentials.json?v=${new Date().getTime()}`);

        // Check if the fetch was successful
        if (!response.ok) {
            throw new Error('Network response was not ok ' + response.statusText);
        }

        // Parse the JSON data
        const data = await response.json();

        return data; // Return the data
    } catch (error) {
        console.error('There was a problem with the fetch operation:', error);
        return null; // Return null or handle the error as needed
    }
}

function showLoader() {
    document.getElementById('loaderOverlay').style.display = 'flex';
}

function hideLoader() {
    document.getElementById('loaderOverlay').style.display = 'none';
}

function store_data(){
    const urlParams = new URLSearchParams(window.location.search);
    const table_no = urlParams.get('table');
    if(table_no){
        localStorage.setItem('table', table_no)
        const expirationTime = Date.now() + 30 * 60 * 1000; // 30 minutes from now
        localStorage.setItem('urlExpiration', expirationTime);
        window.location.href = window.location.protocol + "//" + window.location.host + window.location.pathname;
    }
}

function redirect_to_home(){
    window.location.href = 'index.html';
}

function decrypt_values(value, key){
    const decryptedBytes = CryptoJS.AES.decrypt(value, key);
    return decryptedBytes.toString(CryptoJS.enc.Utf8);
}