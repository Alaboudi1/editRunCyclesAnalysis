let getAllDebuggingEpisodes = ()=>{
    let debuggingSessions = window.dataset.map(video=>({
        title: video.videoTitle,
        episodes: video.annotations.filter(session=>session.title === "Debugging"),
    }))
    debuggingSessions = debuggingSessions.map(({title, episodes, sessionTotalTime})=>{
        let localSessions = [];
        const newSessions = []
        episodes.forEach(session=>{
            if (session.description.search("DF4:") > -1) {
                localSessions.push(session);
            } else {
                if (localSessions.length === 0) {
                    newSessions.push({
                        ...session,
                        totalTime: util.getDurationInSeconds(session.duration.end.time, session.duration.start.time),
                        id: title
                    })
                } else {
                    localSessions.push(session);
                    const completeSession = {
                        description: `${localSessions[0].description} \n ${localSessions[localSessions.length - 1].description} `,
                        id: title,
                        subAnnotations: localSessions.map(session=>session.subAnnotations).flat(),
                        duration: {
                            start: localSessions[0].duration.start,
                            end: localSessions[localSessions.length - 1].duration.end
                        },
                        totalTime: localSessions.reduce((total,session)=>total + util.getDurationInSeconds(session.duration.end.time, session.duration.start.time), 0),
                        title
                    }
                    newSessions.push(completeSession);
                    localSessions = [];
                }
            }

        }
        )
        return {
            episodes: newSessions.sort((a,b)=>b.totalTime - a.totalTime),
            title,
        }
    }
    )
    return debuggingSessions.sort((a,b)=>(b.episodes.length - a.episodes.length)).flatMap(s=>s.episodes)
}

getAllDevelopmentEpisodes = ()=>{
    let video = window.dataset.map(video=>({
        title: video.videoTitle,
        episodes: video.annotations.sort((a,b)=>util.stringToSecondsFormat(a.duration.start.time) - util.stringToSecondsFormat(b.duration.start.time))
    }))

    let developmentEpisodes = video.map(({title, episodes})=>{
        let localSessions = [];
        const newSessions = [];

        for (const [index,episode] of episodes.entries()) {
            if (episode.title !== "Development")
                continue;
            localSessions.push({
                ...episode,
                title
            });

            if (index === episodes.length - 1 || episodes[index + 1]?.title === "Debugging" || (index === episodes.length - 2 && episodes[index + 1]?.title === "Irrelevant")) {
                const completeSession = localSessions.reduce((final,local)=>{
                    return {
                        id: local.title + local.id,
                        subAnnotations: [...final.subAnnotations, ...local.subAnnotations],
                        duration: {
                            start: localSessions[0].duration.start,
                            end: localSessions[localSessions.length - 1].duration.end
                        },
                        totalTime: final.totalTime + util.getDurationInSeconds(local.duration.end.time, local.duration.start.time)
                    }

                }
                , {
                    description: "",
                    subAnnotations: [],
                    totalTime: 0
                })
                localSessions = [];
                newSessions.push(completeSession);
            }

        }
        return {
            episodes: newSessions,
            title
        }
    }
    )
    let dev = developmentEpisodes.sort((a,b)=>b.episodes.length - a.episodes.length).flatMap(e=>e.episodes.sort((a,b)=>(b.totalTime - a.totalTime)))
    return dev
    //     dev.filter(episode=>!debuggingOnlyVideos.find(title=>episode.id.includes(title)))
}

let cycle = (startTitle,endTitle,episodes=getAllDebuggingEpisodes())=>{
    let cyclesPerEpisodes = episodes.map(episode=>{
        let cycles = [];
        let other = [];
        let currentCycle = {
            activities: []
        };
        let endFalg = undefined;
        for (sub of episode.subAnnotations) {
            localTitle = normalizeToEdit(sub.title);
            if (currentCycle.started == undefined) {
                // no cycles started
                if (!localTitle.includes(startTitle)) {
                    //activity is not the start activity
                    //                     if (!localTitle.includes(endTitle)) {
                    other.push({
                        title: sub.title,
                        activityTime: util.getDurationInSeconds(sub.duration.end.time, sub.duration.start.time),
                        duration: sub.duration,
                        description: sub.description,
                        id: sub.id
                    })
                    //                     }
                    continue;
                }
                currentCycle.started = {
                    // the start activity
                    title: sub.title,
                    activityTime: util.getDurationInSeconds(sub.duration.end.time, sub.duration.start.time),
                    duration: sub.duration,
                    description: sub.description,
                    id: sub.id

                }
                continue;
            }
            if (currentCycle.started) {
                // the cycle is started 
                if (localTitle.includes(endTitle)) {
                    // first encounter of the end of the cycle
                    if (endFalg) {
                        // there is a pervoius end of the cycle
                        currentCycle.activities.push(endFalg)
                    }
                    endFalg = {
                        // set the end flag
                        title: sub.title,
                        activityTime: util.getDurationInSeconds(sub.duration.end.time, sub.duration.start.time),
                        duration: sub.duration,
                        description: sub.description,
                        id: sub.id,

                    }
                    continue
                }
                if (localTitle.includes(startTitle) && endFalg) {
                    // the new cycle will start and the flag of the end of current cycle is set
                    currentCycle.ended = endFalg
                    cycles.push(currentCycle);

                    currentCycle = {
                        activities: []
                    }
                    currentCycle.started = {
                        // the start cycle
                        title: sub.title,
                        activityTime: util.getDurationInSeconds(sub.duration.end.time, sub.duration.start.time),
                        duration: sub.duration,
                        description: sub.description,
                        id: sub.id,

                    }
                    currentCycle.ended = undefined;
                    endFalg = undefined;
                    continue;
                }
                // activities within a cycle
                currentCycle.activities.push({
                    title: sub.title,
                    activityTime: util.getDurationInSeconds(sub.duration.end.time, sub.duration.start.time),
                    duration: sub.duration,
                    description: sub.description,
                    id: sub.id

                })
            }
        }
        if (endFalg && currentCycle.started) {
            // the episode ended before closing the cycle
            currentCycle.ended = endFalg
            cycles.push(currentCycle);
            currentCycle = {
                activities: []
            }
            currentCycle.ended = undefined;
            endFalg = undefined;
        } else if (currentCycle.started) {
            // what if an episode ended with lots of edits and not tests??
            other.push({
                title: currentCycle.started.title,
                activityTime: util.getDurationInSeconds(currentCycle.started.duration.end.time, currentCycle.started.duration.start.time),
                duration: currentCycle.started.duration,
                description: currentCycle.started.description,
                id: currentCycle.started.id
            })
        }
        if (currentCycle.activities.length > 0) {
            //what if there was activities but only outside the cycles
            other.push(...currentCycle.activities.map(sub=>({
                title: sub.title,
                activityTime: util.getDurationInSeconds(sub.duration.end.time, sub.duration.start.time),
                duration: sub.duration,
                description: sub.description,
                id: sub.id

            })));
            currentCycle = {
                activities: []
            }
            currentCycle.ended = undefined;
            endFalg = undefined;
        }

        return {
            cycles,
            title: episode.id.trim(),
            episodeTime: episode.subAnnotations.reduce((a,b)=>a + util.getDurationInSeconds(b.duration.end.time, b.duration.start.time), 0),
            other,

        };

    }

    )
    return cyclesPerEpisodes;

}

let getOccurancesInEachPresentage = ()=>{
    let obj = new Map();
    episodes = getAllDebuggingEpisodes();
    episodes.forEach(e=>{
        let subAnno = e.subAnnotations;
        for (let i = 0; i < 10; i++) {
            let {start, end} = getDurationFromPresentage(i / 10, (i + 1) / 10, e.duration.start.time, e.totalTime);
            let activities = getActivitiesForDuration(start, end, subAnno);
            let summary = activities.map(a=>normalizeToEdit(a.title, a.description))
            let arr = obj.get((i + 1)) ?? [];
            obj.set((i + 1), [...arr, ...summary])
        }
    }
    )
    let finalarr = [];
    for ([key,value] of obj.entries()) {
        finalarr.push(getObjectWithcounts((key / 10) * 100, value))
    }
    return finalarr;
}

let getObjectWithcounts = (id,activities)=>{
    return {
        id: Number(id.toFixed(3) / 100),
        "Browsing a file of code": activities.filter(a=>a.includes("None")).length,
        "Editing a file of code": activities.filter(a=>a.includes("Edit")).length,
        "Consulting external resources": activities.filter(a=>a.includes("Seeking")).length,
        "Inspecting program": activities.filter(a=>a.includes("Inspecting")).length,
        "Testing program": activities.filter(a=>a.includes("Testing")).length,
        "Other": activities.filter(a=>a.includes("Others")).length,
        //         "Browsing files of code": 0,
        //         "Editing files of code": 0,
        //         "Consulting external resources": 0,
        //         "Inspecting programs": 0,
        //         "Testing programs": 0,
        //         "Other":0
    }
}
let normalizeToEdit = (activity,description)=>{
    switch (activity) {
    case "Interacting with a file of code(Log)":

    case "Interacting with a file of code(Edit)":

    case "Interacting with a file of code(Breakpoint)":

    case "Interacting with a file of code(Edit, Log)":

    case "Interacting with a file of code(Edit, Breakpoint)":

    case "Interacting with a file of code(Log, Breakpoint)":
    case "Interacting with a file of code(None)":

        return "Interacting with a file of code(Edit)";
        break;
    default:
        return activity;
    }
}

getPersentageofTesting = ()=>getOccurancesInEachPresentage().map(e=>e["Testing program"] / 782 * 100);

getNumberOfCycles = (episodes)=>cycle("Edit", "Test", episodes).reduce((acc,curr)=>acc + curr.cycles.length, 0)
sortCycles = (episodes)=>cycle("Edit", "Test", episodes).sort((a,b)=>a.cycles.length - b.cycles.length)
NumberOFCycles_EpisodeTime = ()=>sortCycles().map(e=>({
    cycles: e.cycles.length,
    episodeTime: e.episodeTime
}))

avgCyclesDuration = (episodes)=>{
    return sortCycles(episodes).map(c=>{
        if (c.cycles.length === 0)
            return {
                avgCycleTime: 0,
                // medianCycleTime: 0,
                episodeTime: c.episodeTime
            };
        let totalTime = c.cycles.reduce((acc,curr)=>acc + curr.cycleTime, 0);
        return {
            avgCycleTime: totalTime / c.cycles.length,
            // medianCycleTime: median(c.cycles.map(c=>c.cycleTime)),
            episodeTime: c.episodeTime
        }
    }
    )
}

function median(values) {
    if (values.length === 0)
        return 0;

    values.sort(function(a, b) {
        return a - b;
    });

    var half = Math.floor(values.length / 2);

    if (values.length % 2)
        return values[half];

    return (values[half - 1] + values[half]) / 2.0;
}
let getQuestions = (title)=>{
    return getAllDebuggingEpisodes().flatMap(episode=>{
        return episode.subAnnotations.filter(sub=>sub.title.includes(title)).filter(sub=>{
            return (sub.description.includes("?") || sub.description.includes("O5"))
        }
        )
    }
    )
}

let getCyclesActivities = ()=>{

    return cycle("Testing").flatMap(e=>{
        return e.cycles.map(cycle=>{
            return {
                TypeOFActivities: cycle.activities.map(a=>a.title)
            }
        }
        )
    }
    )
}

let getCycles = ()=>{
    let debuggingCycles = cycle("Edit", "Test", getAllDebuggingEpisodes());
    let programmingCycles = cycle("Edit", "Test", getAllDevelopmentEpisodes());

    debuggingCycles = debuggingCycles.map(episode=>{
        let internalOther = []
        let cycles = {
            videoTitle: episode.title,
            other: episode.other,
            episodeTime: episode.episodeTime,
            cycles: episode.cycles.map(cycle=>{
                let obj = {
                    activities: [cycle.started, ...cycle.activities, cycle.ended].sort((a,b)=>util.stringToSecondsFormat(a.duration) - util.stringToSecondsFormat(b.duration))
                }
                if (!obj.activities[obj.activities.length - 1].title.includes("Testing")) {
                    while (!obj.activities[obj.activities.length - 1].title.includes("Testing")) {
                        internalOther.push(obj.activities.pop())
                    }
                }
                obj.cycleTime = obj.activities.reduce((a,b)=>a + b.activityTime, 0)
                return obj;
            }
            )
        }
        cycles.other = [...internalOther, ...cycles.other]
        return cycles;
    }
    )

    programmingCycles = programmingCycles.map(episode=>{
        let internalOther = []
        let cycles = {
            videoTitle: episode.title,
            other: episode.other,
            episodeTime: episode.episodeTime,
            cycles: episode.cycles.map(cycle=>{
                let obj = {
                    activities: [cycle.started, ...cycle.activities, cycle.ended].sort((a,b)=>util.stringToSecondsFormat(a.duration) - util.stringToSecondsFormat(b.duration)),

                }
                if (!obj.activities[obj.activities.length - 1].title.includes("Testing")) {
                    while (!obj.activities[obj.activities.length - 1].title.includes("Testing")) {
                        internalOther.push(obj.activities.pop())
                    }
                }
                obj.cycleTime = obj.activities.reduce((a,b)=>a + b.activityTime, 0)
                return obj;
            }
            )
        }
        cycles.other = [...internalOther, ...cycles.other]
        return cycles;
    }
    )
    return {
        debuggingCycles,
        programmingCycles
    };
}

let summraySycles = ()=>{
    let {debuggingCycles, programmingCycles} = getCycles();
    debuggingCycles = debuggingCycles.map(e=>{

        return {
            ...e,
            videoTitle: normalizeVideoId(e.videoTitle),
            other: e.other.length,
            otherNumber: e.other.length,
            otherTime: e.other.reduce((a,b)=>a + b.activityTime, 0),
            cyclesNumber: e.cycles.length,
            other: e.other,
            cyclesTime: e.cycles.reduce((a,b)=>{
                return a + b.activities.reduce((a,b)=>a + b.activityTime, 0)
            }
            , 0)
        }
    }
    )

    programmingCycles = programmingCycles.map(e=>{

        return {
            ...e,
            videoTitle: normalizeVideoId(e.videoTitle),
            other: e.other,
            otherNumber: e.other.length,
            otherTime: e.other.reduce((a,b)=>a + b.activityTime, 0),
            cyclesNumber: e.cycles.length,
            cyclesTime: e.cycles.reduce((a,b)=>{
                return a + b.activities.reduce((a,b)=>a + b.activityTime, 0)
            }
            , 0)
        }
    }
    )
    return {
        debuggingCycles,
        programmingCycles
    };

}

let getCyclesDetails = ()=>{
    let r = summraySycles()
    debuggingCycles = r.debuggingCycles.flatMap(({cycles, other, ...e})=>cycles).map(c=>{
        return {
            ...c,
            activities: c.activities.length,
            edit: c.activities.filter(a=>a.title.includes("file")).length,
            test: c.activities.filter(a=>a.title.includes("Testing")).length,
            resrouces: c.activities.filter(a=>a.title.includes("information")).length,
            interactingIDE: c.activities.filter(a=>a.title.includes("Others")).filter(a=>a.description.includes("OT5")).length,
            other: c.activities.filter(a=>a.title.includes("Others")).filter(a=>!a.description.includes("OT5")).length,
            work: "Debugging"
        }
    }
    )
    programmingCycles = r.programmingCycles.flatMap(({cycles, other, ...e})=>cycles).map(c=>{
        return {
            ...c,
            activities: c.activities.length,
            edit: c.activities.filter(a=>a.title.includes("file")).length,
            test: c.activities.filter(a=>a.title.includes("Testing")).length,
            resrouces: c.activities.filter(a=>a.title.includes("information")).length,
            interactingIDE: c.activities.filter(a=>a.title.includes("Others")).filter(a=>a.description.includes("OT5")).length,
            other: c.activities.filter(a=>a.title.includes("Others")).filter(a=>!a.description.includes("OT5")).length,
            work: "Programming"

        }
    }
    )

    return {
        debuggingCycles,
        programmingCycles
    };
}

let getCyclesActivites = ()=>{
    let r = summraySycles()
    debuggingCycles = r.debuggingCycles.flatMap(({cycles, other, ...e})=>cycles).flatMap((c,i)=>{

        return c.activities.map(ac=>{
            return {
                activity: normalizeActivity(ac.title),
                time: ac.activityTime,
                work: "Debugging"
            }
        }
        )
    }
    )
    programmingCycles = r.programmingCycles.flatMap(({cycles, other, ...e})=>cycles).flatMap(c=>{

        return c.activities.map(ac=>{
            return {
                activity: normalizeActivity(ac.title),
                time: ac.activityTime,
                work: "PRogramming"
            }
        }
        )
    }
    )

    return [...debuggingCycles, ...programmingCycles];
}
let getCyclesSteps = ()=>{
    let r = summraySycles()
    debuggingCycles = r.debuggingCycles.flatMap(({cycles, other, ...e})=>cycles).flatMap((c,i)=>{

        return [{
            step: "edit",
            percentage: c.activities.filter(ac=>(normalizeActivity(ac.title) === "edit")).reduce((a,b)=>a + b.activityTime, 0) / c.cycleTime * 100,
            work: "Debugging"
        }, {
            step: "run",
            percentage: c.activities.filter(ac=>(normalizeActivity(ac.title) === "run")).reduce((a,b)=>a + b.activityTime, 0) / c.cycleTime * 100,
            work: "Debugging"
        }, {
            step: "other",
            percentage: c.activities.filter(ac=>(normalizeActivity(ac.title) === "other")).reduce((a,b)=>a + b.activityTime, 0) / c.cycleTime * 100,
            work: "Debugging"
        }, ]

    }
    )
    programmingCycles = r.programmingCycles.flatMap(({cycles, other, ...e})=>cycles).flatMap(c=>{

        return [{
            step: "edit",
            percentage: c.activities.filter(ac=>(normalizeActivity(ac.title) === "edit")).reduce((a,b)=>a + b.activityTime, 0) / c.cycleTime * 100,
            work: "Programming"
        }, {
            step: "run",
            percentage: c.activities.filter(ac=>(normalizeActivity(ac.title) === "run")).reduce((a,b)=>a + b.activityTime, 0) / c.cycleTime * 100,
            work: "Programming"
        }, {
            step: "other",
            percentage: c.activities.filter(ac=>(normalizeActivity(ac.title) === "other")).reduce((a,b)=>a + b.activityTime, 0) / c.cycleTime * 100,
            work: "Programming"
        }, ]

    }
    )

    return [...debuggingCycles, ...programmingCycles];
}
let normalizeActivity = (title)=>{
    if (title.includes("Testing"))
        return "run";
    if (title.includes("file"))
        return "edit";
    return "other";

}
let normalizeVideoId = (id)=>{
    let title = id.substring(0, 10).trim();
    switch (title) {
    case "Part 12.1":
    case "Part 5 - U":
        return "Uzual";

    case "Moving Kap":
    case "Solving mo":
        return "Kap";

    case "Ardalis -":
        return "Ardalis";
    case "Ep. 73 - P":
        return "Vectrex";
    case "webpack 5":
        return "Webpack";

    case "replay - t":
        return "replay";
    case "OS hacking":
    case "OS hacking":
        return "Serenity";
    case "downshift:":
        return "downshift";
    case "Open Sourc":
    case "Open Sourc":
        return "Alacritty";

    case "curl devel":
        return "Curl";

    case "The Joy of":
        return "FireFox";
    default:
        debugger ;
    }
}
    // how may files
    // how many files edit vs browsed
    //association between files number and edit duration
    // type other work interwinded with edits
    // association between the existing of other work and the edit step length

let extractEditCharact = ()=>{
    let {debuggingCycles, programmingCycles} = extractCycles();

let editDe = debuggingCycles.map(episodeCycls => {

          let editActivites = episodeCycls.cycles.map(c =>
          {
          })

      })
}

let extractRunCharact = ()=>{
    let {debuggingCycles, programmingCycles} = extractCycles();

    // how did they run the program (manual vs autamted tests)
    // how many used only intermidate state (log vs debugger)
    // how may only output 
    // how many both
    // type other work interwinded with run
    // association between the existing of other work and the edit step length

      

}

let extractOtherCharact = ()=>{
// type other work interwinded with cycles
// association between the existing of other work and the edit step length

}

let extractCycles = ()=>{
    let cycles = summraySycles()
    let debuggingCycles = cycles.debuggingCycles.map(({cycles, cyclesTime})=>({
        cyclesTime,
        cycles
    }));
    let programmingCycles = cycles.programmingCycles.map(({cycles, cyclesTime})=>({
        cyclesTime,
        cycles
    }));
    return {
        debuggingCycles,
        programmingCycles
    };
}

