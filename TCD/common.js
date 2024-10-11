function get_dish_url(dish_name) {
    // Split the string into words by spaces, then join with an underscore
    return 'src/'+dish_name.split(' ').join('_')+'.png';
}

async function get_credentials() {
    try {
        // Fetch the JSON file
        const response = await fetch('credentials.json');

        // Check if the fetch was successful
        if (!response.ok) {
            throw new Error('Network response was not ok ' + response.statusText);
        }

        // Parse the JSON data
        const data = await response.json();

        // Log the JSON data
        console.log(data);

        return data; // Return the data
    } catch (error) {
        console.error('There was a problem with the fetch operation:', error);
        return null; // Return null or handle the error as needed
    }
}

function showLoader() {
    console.log("ppp")
    document.getElementById('loaderOverlay').style.display = 'flex';
}

function hideLoader() {
    console.log("pppooo")
    document.getElementById('loaderOverlay').style.display = 'none';
}