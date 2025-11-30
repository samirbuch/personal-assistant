


let endtime = document.getElementById("end-time");
let starttime = document.getElementById("start-time");

function startBeforeEnd(start, end) {
    let [startHours, startMinutes] = start.split(":").map(Number);
    let [endHours, endMinutes] = end.split(":").map(Number);

    console.log(`Start - Hours: ${startHours}, Minutes: ${startMinutes}`);
    console.log(`End - Hours: ${endHours}, Minutes: ${endMinutes}`);

    if(startHours > endHours || (startHours === endHours && startMinutes > endMinutes)) {
        return false; // Start time is later than end time
    }
    return true; // Start time is earlier than or equal to end time
}



starttime.addEventListener("change", () => {
    if(!startBeforeEnd(starttime.value, endtime.value)){
        endtime.value = starttime.value;
        endtime.min = starttime.value;
    }
})

endtime.addEventListener("change", () => {
    if(!startBeforeEnd(starttime.value, endtime.value)){
        endtime.value = starttime.value;
        endtime.min = starttime.value;
        let end = document.querySelector(".form-entry end");
        console.log(end)
    }
})
