function get_dish_url(dish_name) {
    // Split the string into words by spaces, then join with an underscore
    return 'src/'+dish_name.split(' ').join('_')+'.png';
}