function include_server_subdir(url) {
  sub_dir =  window.location.pathname.split("/images/image_sets_explore/")[0]
  if (sub_dir === "") { return url } else { return sub_dir + url }
}

let csrfToken = $('[name="csrfmiddlewaretoken"]').first().val();
let headers = {
  "Content-Type": 'application/json',
  "X-CSRFTOKEN": csrfToken
};

$('#tagbox').autocomplete({
  lookup: function(query, done) {
    let query_array = query.split(',').map(function(element) {
      return element.trim();
    });
    let params = {
      query: query_array[query_array.length - 1]
    };
    $.ajax(include_server_subdir('/images/api/imageset/tag/autocomplete/?') + $.param(params), {
      type: 'GET',
      headers: headers,
      dataType: 'json',
      success: function(data, textStatus, jqXHR) {
        query_array.pop();
        let output_string = '';
        if (query_array.length > 0) {
          output_string = query_array.join(', ') + ', ';
        }
        let suggestions = [];
        for (let element of data.suggestions) {
          if (!query_array.includes(element)) {
            suggestions.push({'value': output_string + element})
          }
        }
        console.log(suggestions);
        done({ suggestions: suggestions });
      }
    });
  }
});
