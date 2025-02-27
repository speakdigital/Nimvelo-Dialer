const $ = require('jquery');
const { ipcRenderer } = require('electron');
let phonebookEntries = [];


$(document).ready(() => {

    ipcRenderer.invoke('get-app-version').then( (version) => {
        $("#version").text(version);
});

    ipcRenderer.invoke('get-me').then( (me) => {
            $("#me").text(me.name);
    });
    getOutgoingNumbers();
    getPhonebook();

    // setup events
    $("#dial").on("click", function(event)  {
        event.preventDefault();
        dial(); // ✅ Call the function properly
    });
    $(document).ready(function () {
        $("#dialerNumber").on("keypress", function (event) {
            if (event.which === 13) { // 13 is the keycode for Enter
                event.preventDefault(); // Prevent form submission
                $("#dial").click(); // Simulate button click
            }
        });
    });
    
    
    $(document).on("click", "#exit", function(event) {
        console.log("Exit was clicked");
        event.preventDefault(); // ✅ Prevents default action (if needed)
        ipcRenderer.send("close-app");
    });

    $(document).on("click", "#refresh", function(event) {
        event.preventDefault();
        getPhonebook();
    });


    function toggleDialButton() {
        const isEmpty = $('#dialerNumber').val().trim() === '';
        $('#dial').prop('disabled', isEmpty);
    }

    // Run on page load to ensure the button is disabled if input is empty
    toggleDialButton();

    // Listen for input changes and enable/disable button
    $('#dialerNumber').on('input', toggleDialButton);


    // phonebook dial button action

    $(document).on("click", ".call-button", function () {
        // Find the phone number within the same phonebook entry
        const phoneNumber = $(this).siblings(".contact-info").find("span").text().trim();

        if (phoneNumber) {
            // Set the phone number in the dialer input field
            $("#dialerNumber").val(phoneNumber);

            //switch to dialpad
            $("#blockPhonebook").hide(); // Hide phonebook
            $("#blockDialer").show(); // Show dialer
            toggleDialButton();

            // Trigger the dial button click
            $("#dial").click();
        }
    });




    // show and hide pages
    $("#showDialpad").tooltip({ content: "Show Dialpad"  });
    $("#showPhonebook").tooltip({ content: "Show Phonebook"  });

    $("#showDialpad").on("click", function (event) {
        event.preventDefault(); // Prevent the default link action
        $("#blockPhonebook").hide(); // Hide phonebook
        $("#blockDialer").show(); // Show dialer
    });

    $("#showPhonebook").on("click", function (event) {
        event.preventDefault(); // Prevent the default link action
        $("#blockDialer").hide(); // Hide dialer
        $("#blockPhonebook").show(); // Show phonebook
    });

    $("#showSettings").on("click", function (event) {
        event.preventDefault(); // Prevent the default link action
        ipcRenderer.send("show-registerext");
    });

    $(document).on("click", ".delete-button", function () {
        let $entry = $(this).closest(".phonebook-entry"); 
        let contactId = $entry.data("id");
        let contactName = $entry.find("strong").text(); // Get contact name
    
        // Show confirmation dialog
        if (confirm(`Are you sure you want to delete ${contactName}?`)) {
            ipcRenderer.invoke("delete-contact", contactId);
            $entry.fadeOut(300, function () { 
                $(this).remove(); 
            });
        }
    });

    $("#add-contact").on("click", function(event) {
        event.preventDefault();
        $("#blockAdd").slideDown(300);
    })


    $("#cancelAdd").on("click", function(event) {
        event.preventDefault();
        $("#blockAdd").slideUp(300);
    })

    // Allow only letters, numbers, and spaces in Name field
    $("#addName").on("input", function () {
        $(this).val($(this).val().replace(/[^a-zA-Z0-9 ]/g, "")); 
    });

    // Allow only digits in Number field
    $("#addNumber").on("input", function () {
        $(this).val($(this).val().replace(/\D/g, "")); 
    });

    $(document).on("click", "#doAdd", function () {
        let name = $("#addName").val().trim();
        let number = $("#addNumber").val().trim();
    
        // Show confirmation dialog
        if (confirm(`Are you sure you want to add ${name} with number ${number}?`)) {
            ipcRenderer.invoke('phonebook-add',name,number)
            .then((response) => {
                if (response.success)
                {   getPhonebook();
                    $("#addName").val("");
                    $("#addNumber").val("");
                    $("#blockAdd").slideUp(300);
                } else {
                    alert(response.message);
                }
            })
            .catch(error => {
                console.error("Failed to add phonebook entry", error);
            });
            
        }
    });

});



function getOutgoingNumbers() {

    ipcRenderer.invoke('get-outgoingnumers')
        .then((numbers) => {
            console.log("Got numbers: ",numbers);
            const idDropdown = $('#callerIdPicker');

            // Remove existing options
            idDropdown.empty();

            // Populate dropdown with received extensions
            numbers.forEach(number => {
                idDropdown.append($("<option></option>").attr("value", number.value).text(number.label));
            });
        })
        .catch(error => {
            console.error("Failed to load outgoing caller IDs:", error);
        });
}

function getPhonebook() {
    phonebookEntries = [];
    // Function to clear the phonebook list
    $("#phonebook-list").empty(); // Removes all child elements
    ipcRenderer.invoke('get-phonebook')
    .then((phonebook) => {
        console.log("Got phonebook: ",phonebook.length);

        // Sort entries alphabetically by name
        phonebook.sort((a, b) => a.name.localeCompare(b.name));

        phonebookEntries = phonebook.map(entry => ({
            label: `${entry.name} (${entry.phoneNumber})`,
            value: entry.phoneNumber
        }));

        updateAutocomplete();

        phonebook.forEach(entry=>{
            let listItem = $(
                `<li class="phonebook-entry" data-id="${entry.id}">
                    <div class="contact-info">
                        <strong>${entry.name}</strong>
                        <span>${entry.phoneNumber}</span>
                    </div><div class="button-group">
                    <button class="delete-button btn-warn"><i class="fas fa-trash"></i></button>
                    <button class="call-button"><i class="fas fa-phone"></i></button>
                    </div>
                </li>`
            );
            $("#phonebook-list").append(listItem);
        })

    });

}

function updateAutocomplete() {
    $("#dialerNumber").autocomplete({
        source: phonebookEntries,
        minLength: 3,
        select: function (event, ui) {
            $("#dialerNumber").val(ui.item.value); // Set selected number
            return false;
        }
    });
}


function dial() {
      // We check the diabled status of the button first to stop lots of requests to api and extension
    if ($('#dial.disabled').length == false) {
        $("#dial").addClass("disabled");
        // We let the user click the button again after 3 seconds
        setTimeout(function(){ $("#dial").removeClass("disabled"); },3000);
        // Get number from form
        var call = $('#dialerNumber').val();   

        if (document.getElementById('dialerWithhold').checked) {
            var withhold = 1;
        } else {
            var withhold = 0;
        }
        var selectedCallerId = $('#callerIdPicker').val();
        console.log("About to call ",call, " from ",selectedCallerId);
        ipcRenderer.invoke('dial', call, selectedCallerId, withhold)
            .then((response) => {
                console.log("Dial response:", response);
                $('#status').text(response.message);
                $('#status').css("color", response.success ? "green" : "red");
            })
            .catch((error) => {
                console.error("Dial error:", error);
                $('#status').text("Unknown Dialling Error");
                $('#status').css("color", "red");
            });
    }
}


ipcRenderer.on("focus-dialer", () => {
    const dialerInput = document.getElementById("dialerNumber");
    if (dialerInput) {
        dialerInput.value = "";
        dialerInput.focus();
    }
});
