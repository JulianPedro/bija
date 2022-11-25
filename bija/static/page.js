window.addEventListener("load", function () {

    if(document.querySelector(".main[data-page='home']") != null){
        new bijaFeed();
        new bijaNotes();
        new bijaNotePoster();
    }
    if(document.querySelector(".main[data-page='note']") != null){
        new bijaNotes();
        new bijaThread()
    }
    if(document.querySelector(".main[data-page='profile']") != null){
        new bijaNotes();
        new bijaProfile();
    }
    if(document.querySelector(".main[data-page='messages_from']") != null){
        new bijaMessages()
    }
    if(document.querySelector(".main[data-page='settings']") != null){
        new bijaSettings()
    }
    SOCK()
});

let SOCK = function(){
    var socket = io.connect();
    socket.on('connect', function() {
        socket.emit('new_connect', {data: true});
    });
    socket.on('message', function(data) {
        updateMessageThread(data)
    });
    socket.on('unseen_messages_n', function(data) {
        let el_unseen = document.getElementById("n_unseen_messages")
        if(parseInt(data) == 0){
            el_unseen.style.display = "none"
        }
        else{
            el_unseen.style.display = "inline-block"
            el_unseen.innerText = data
        }
    });
    socket.on('unseen_posts_n', function(data) {
        let el_unseen = document.getElementById("n_unseen_posts")
        if(parseInt(data) == 0){
            el_unseen.style.display = "none"
        }
        else{
            el_unseen.style.display = "inline-block"
            el_unseen.innerText = data
        }
    });
    socket.on('profile_update', function(data) {
        updateProfile(data)
    });
    socket.on('conn_status', function(data) {
        const connections = {'connected': 0, 'recent': 0, 'disconnected': 0, 'none':0}
        for(const relay in data){
            r = data[relay]
            let urel = document.querySelector(".relay[data-url='"+r[0]+"'] .led")
            if(r[1] == null){
                connections['none'] += 1
                if(urel){
                    urel.setAttribute("class", "led none")
                }
            }
            else if(parseInt(r[1]) < 60){
                connections['connected'] += 1
                if(urel){
                    urel.setAttribute("class", "led connected")
                }
            }
            else if(parseInt(r[1]) < 180){
                connections['recent'] += 1
                if(urel){
                    urel.setAttribute("class", "led recent")
                }
            }
            else{
                connections['disconnected'] += 1
                if(urel){
                    urel.setAttribute("class", "led disconnected")
                }
            }
        }
        const el = document.querySelector(".conn-status")
        el.innerHTML = "";
        for (const [k, v] of Object.entries(connections)) {
            if(v > 0){
                let span = document.createElement('span')
                span.classList.add('status')
                let span2 = document.createElement('span')
                span2.classList.add('led', k)
                let span3 = document.createElement('span')
                span3.innerText = v
                span.append(span2)
                span.append(span3)
                el.append(span)
            }
        }


    });
}

let updateProfile = function(profile){
    document.querySelector(".profile-about").innerText = profile.about
    document.querySelector("#profile").dataset.updated_ts = profile.updated_at
    const name_els = document.querySelectorAll(".profile-name");
    for (let i = 0; i < name_els.length; i++) {
        name_els[i].innerText = profile.name
    }
    const pic_els = document.querySelectorAll(".profile-pic");
    for (let i = 0; i < pic_els.length; i++) {
        pic_els[i].setAttribute("src", profile.pic)
    }
}

let updateMessageThread = function(data){
    const messages_elem = document.querySelector("#messages_from")
    if(messages_elem){
        let shouldScroll = false
        if ((window.innerHeight + Math.ceil(window.pageYOffset)) >= document.body.offsetHeight) {
           shouldScroll = true
        }
        messages_elem.innerHTML += data
        if(shouldScroll){
            window.scrollTo(0, document.body.scrollHeight);
        }
        else{
            notify('#', 'new messages')
        }
    }
}

class bijaNotePoster{
    constructor(){
        this.setClicks();
    }

    setClicks(){
        const btn = document.querySelector('#new_post_submit');
        const form = document.querySelector('#new_post_form');

        btn.addEventListener('click', (e) => {
            e.preventDefault();

            const formData = new FormData(form);
            const data = [...formData.entries()];
            const options = {
                method: 'POST',
                body: JSON.stringify(data),
                headers: {
                    'Content-Type': 'application/json'
                }
            }
            fetch('/submit_note', options).then(function(response) {
                return response.json();
            }).then(function(response) {
               if(response['event_id']){
                   notify('/note?id='+response['event_id'], 'Note created. View now?')
               }
            }).catch(function(err) {
                console.log(err)
            });

            return false;
        });
    }
}

class bijaSettings{
    constructor(){
        this.setClicks();
    }

    setClicks(){
        const upd_relay_btn = document.querySelector(".refresh_connections");
        upd_relay_btn.addEventListener("click", (event)=>{
            fetch('/refresh_connections', {
            method: 'get'
            }).then(function(response) {
                return response.text();
            }).then(function(response) {

            }).catch(function(err) {
                console.log(err);
            });
        });
        const relays = document.querySelectorAll(".relay[data-url]");
        for (const relay of relays) {
            relay.querySelector(".del-relay").addEventListener("click", (event)=>{
                fetch('/del_relay?url='+relay.dataset.url, {
                    method: 'get'
                }).then(function(response) {
                    return response.text();
                }).then(function(response) {
                    relay.remove()
                }).catch(function(err) {
                    console.log(err);
                });
            });
        }

        const relay_btn = document.querySelector("#addrelay");
        relay_btn.addEventListener("click", (event)=>{
            event.preventDefault();
            event.stopPropagation();
            const form = document.querySelector("#relay_adder")
            const formData = new FormData(form);
            const data = [...formData.entries()];
            const options = {
                method: 'POST',
                body: JSON.stringify(data),
                headers: {
                    'Content-Type': 'application/json'
                }
            }
            fetch('/add_relay', options).then(function(response) {
                return response.json();
            }).then(function(response) {
               if(response['success']){
                   notify('#', 'relay added')
               }
            }).catch(function(err) {
                console.log(err)
            });
        });
    }
}

class bijaThread{

    constructor(){
        this.focussed = false;
        this.replies = [];
        this.setFolding();
        window.addEventListener("hashchange", (event)=>{
            this.setFolding();
        });
    }

    setFolding(){
        this.focussed = window.location.hash.substring(1);
        const note_elems = document.querySelectorAll(".note-container")
        for (const n of note_elems) {
            n.classList.remove('main', 'ancestor', 'reply')
            n.style.display = 'none'
        }
        this.showReplies()
        this.showMain()

    }

    showMain(){
        const main = document.querySelector(".note-container[data-id='"+this.focussed+"']")
        if(main){
            main.classList.add('main')
            main.style.display = 'flex'
            this.setReplyCount(main)
            if(main.dataset.parent.length > 0){
                this.showParent(main.dataset.parent, main)
            }
            if(this.replies.length > 0){
                main.classList.add('ancestor')
            }
            main.scrollIntoView({
                behavior: 'auto',
                block: 'center',
                inline: 'center'
            });
        }
        else{
            const new_el = document.createElement('div');
            new_el.innerHTML = "<p>Event ("+this.focussed+") not yet found on network</p>";
            new_el.classList.add('note-content')
            document.querySelector('#thread-items').prepend(new_el)
        }
    }

    showReplies(){
        this.replies = document.querySelectorAll(".note-container[data-parent='"+this.focussed+"']")
        for (const n of this.replies) {
            n.classList.add('reply')
            n.style.display = 'flex'
            this.setReplyCount(n)
        }
    }

    showParent(id, child){
        const el = document.querySelector(".note-container[data-id='"+id+"']");
        if(el){
            el.classList.add('ancestor');;
            el.style.display = 'flex';
            this.setReplyCount(el);
            const parent = el.dataset.parent;;
            if(parent.length > 0){
                this.showParent(parent, el);
            }
        }
        else{
            const new_el = document.createElement('div');
            new_el.innerHTML = "<p>Event ("+id+") not yet found on network</p>";
            new_el.classList.add('note-content')
            child.parentElement.insertBefore(new_el, child)
        }
    }
    setReplyCount(el){
        const id = el.dataset.id;
        const n = document.querySelectorAll(".note-container[data-parent='"+id+"']").length;
        const r_el = el.querySelector('.reply-n')
        r_el.innerText = n
    }


}

class bijaMessages{
    constructor(){
        window.scrollTo(0, document.body.scrollHeight);
        this.setSubmitMessage()
    }

    setSubmitMessage(){
        document.querySelector('#new_message_submit').addEventListener("click", (event)=>{
            event.preventDefault();
            event.stopPropagation();
            this.postMessage()
            return false
        });
        document.querySelector('#new_message').addEventListener("keyup", (event)=>{
            if(event.which === 13){
                this.postMessage()
            }
        });

    }
    postMessage(){
        const form = document.querySelector("#new_message_form")
        const formData = new FormData(form);
        const data = [...formData.entries()];
        const options = {
            method: 'POST',
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json'
            }
        }
        fetch('/submit_message', options).then(function(response) {
            return response.json();
        }).then(function(response) {
           if(response['event_id']){
               window.scrollTo(0, document.body.scrollHeight);
               notify('#', 'Message sent')
               document.querySelector("#new_message").value = ''
           }
        }).catch(function(err) {
            console.log(err)
        });
    }
}

class bijaProfile{

    constructor(){
        this.setClicks()
    }

    setClicks(){
        const btns = document.querySelectorAll(".follow-btn");
        for (const btn of btns) {
            btn.addEventListener("click", (event)=>{
                event.preventDefault();
                event.stopPropagation();
                let id = btn.dataset.rel;
                let state = btn.dataset.state;
                this.setFollowState(id, state);
                return false;
            });
        }
        const edit_tog = document.querySelector(".profile-edit-btn");
        if(edit_tog){
            edit_tog.addEventListener("click", (event)=>{
                event.preventDefault();
                event.stopPropagation();
                const pel = document.querySelector("#profile");
                if(pel.classList.contains('editing')){
                    pel.classList.remove('editing')
                }
                else{
                    pel.classList.add('editing')
                }
            });
            const pupd = document.querySelector("#pupd");
            pupd.addEventListener("click", (event)=>{
                event.preventDefault();
                event.stopPropagation();
                const form = document.querySelector("#profile_updater")
                const formData = new FormData(form);
                const data = [...formData.entries()];
                const options = {
                    method: 'POST',
                    body: JSON.stringify(data),
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
                fetch('/upd_profile', options).then(function(response) {
                    return response.json();
                }).then(function(response) {
                   if(response['success']){
                       notify('#', 'Profile updated')
                   }
                }).catch(function(err) {
                    console.log(err)
                });
            });
        }
    }

    setFollowState(id, state){
        let o = this;
        fetch('/follow?id='+id+"&state="+state, {
            method: 'get'
        }).then(function(response) {
            return response.text();
        }).then(function(response) {
            document.querySelector(".profile-tools").innerHTML = response
        }).catch(function(err) {
            console.log(err);
        });
    }

}

class bijaNotes{
    constructor(){
        this.setClicks()
        document.addEventListener('newContentLoaded', ()=>{
            this.setClicks()
        });
    }

    setClicks(){
        const links = document.querySelectorAll(".reply-link");
        for (const link of links) {
            link.addEventListener("click", (event)=>{
                event.preventDefault();
                event.stopPropagation();
                let id = link.dataset.rel
                document.querySelector(".reply-form[data-noteid='"+id+"']").style.display = "block"
                return false
            });
        }
        const btns = document.querySelectorAll("input[data-reply-submit]");
        for (const btn of btns) {
            btn.addEventListener("click", (event)=>{
                event.preventDefault();
                event.stopPropagation();
                let id = btn.dataset.rel
                this.postReply(id)
                return false
            });
        }
        const note_links = document.querySelectorAll(".note-content[data-rel]");
        for (const note_link of note_links) {
            note_link.addEventListener("click", (event)=>{
                event.preventDefault();
                event.stopPropagation();
                let rel = note_link.dataset.rel
                let id = note_link.dataset.id
                window.location.href = '/note?id='+rel+'#'+id
            });
        }
    }

    postReply(id){
        const form = document.querySelector(".reply-form[data-noteid='"+id+"']")
        const formData = new FormData(form);
        const data = [...formData.entries()];
        const options = {
            method: 'POST',
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json'
            }
        }
        fetch('/submit_note', options).then(function(response) {
            return response.json();
        }).then(function(response) {
           if(response['event_id']){
               notify('/note?id='+response['event_id'], 'Note created. View now?')
           }
        }).catch(function(err) {
            console.log(err)
        });
    }
}

class bijaFeed{

    constructor(){
        this.data = {};
        this.loading = 0;
        this.listener = () => this.loader(this);
        window.addEventListener('scroll', this.listener);
        this.pageLoadedEvent = new Event("newContentLoaded");
    }

    loader(o){
        if (
            (window.innerHeight +window.innerHeight + window.scrollY) >= document.body.offsetHeight && o.loading == 0
        ){
            let nodes = document.querySelectorAll('.note[data-dt]')
            o.requestNextPage(nodes[nodes.length-1].dataset.dt);
        }
    }

    setLoadingCompleted(){
        this.loading = 2; // nothing more to load
    }

    requestNextPage(ts){
        this.loading = 1;
        let o = this;
        fetch('/feed?before='+ts, {
            method: 'get'
        }).then(function(response) {
            return response.text();
        }).then(function(response) {
            o.loadArticles(response);
            document.dispatchEvent(o.pageLoadedEvent);
        }).catch(function(err) {
            console.log(err);
        });
    }

    loadArticles(response){
        document.getElementById("main-content").innerHTML += response;
        this.loading = 0;
    }
}
async function getUpdates() {
    const page = document.querySelector(".main").dataset.page
    const response = await fetch(getUpdaterURL(page));
    const d = await response.json();
    handleUpdaterResponse(page, d)
//    if("unseen_posts" in d){
//        let el_unseen = document.getElementById("n_unseen_posts")
//        if(parseInt(d['unseen_posts']) == 0){
//            el_unseen.style.display = "none"
//        }
//        else{
//            el_unseen.style.display = "inline-block"
//            el_unseen.innerText = d['unseen_posts']
//        }
//    }
//    if("unseen_messages" in d){
//        let el_unseen = document.getElementById("n_unseen_messages")
//        if(parseInt(d['unseen_messages']) == 0){
//            el_unseen.style.display = "none"
//        }
//        else{
//            el_unseen.style.display = "inline-block"
//            el_unseen.innerText = d['unseen_messages']
//        }
//    }
    if("notices" in d){
        const container = document.querySelector(".rightcolumn .notices")
        for (let n in d["notices"]) {
            const div = document.createElement("div")
            div.innerText = d["notices"][n]
            container.prepend(div)
        }
    }
}

let getUpdaterURL = function(page){
    let params = {}
    params['page'] = page
    switch(page){
        case 'profile':
            const profile_elem = document.querySelector("#profile")
            if(profile_elem){
                const pk = profile_elem.dataset.pk
                const updated_ts = profile_elem.dataset.updated_ts
                params['pk'] = pk
                params['updated_ts'] = updated_ts
            }
        case 'messages_from':
            const messages_elem = document.querySelector("#messages_from")
            if(messages_elem){
                const messages_pk = messages_elem.dataset.contact
                params['pk'] = messages_pk
                let nodes = document.querySelectorAll('.msg[data-dt]')
                params['dt'] = nodes[nodes.length-1].dataset.dt
            }
    }
    return '/upd?' + Object.keys(params).map(key => key + '=' + params[key]).join('&');
}

let handleUpdaterResponse = function(page, d){
    switch(page){
        case 'profile':
            if("profile" in d){
                profile = d.profile
                document.querySelector(".profile-about").innerText = profile.about
                document.querySelector("#profile").dataset.updated_ts = profile.updated_at
                const name_els = document.querySelectorAll(".profile-name");
                for (let i = 0; i < name_els.length; i++) {
                    name_els[i].innerText = profile.name
                }
                const pic_els = document.querySelectorAll(".profile-pic");
                for (let i = 0; i < pic_els.length; i++) {
                    pic_els[i].setAttribute("src", profile.pic)
                }
            }
        case 'messages_from':
            if("messages" in d){
                messages = d.messages
                const messages_elem = document.querySelector("#messages_from")
                let shouldScroll = false
                if ((window.innerHeight + Math.ceil(window.pageYOffset)) >= document.body.offsetHeight) {
                   shouldScroll = true
                }
                messages_elem.innerHTML += messages
                if(shouldScroll){
                    window.scrollTo(0, document.body.scrollHeight);
                }
                else{
                    notify('#', 'new messages')
                }
            }
    }
}

let notify = function(link, text){
    n = document.querySelector(".notify")
    if(n !== null) n.remove()
    a = document.createElement("a")
    a.innerText = text
    a.href = link
    document.body.append(a)
    a.classList.add('notify')
    setTimeout(function(){
        a.remove()
    }, 3500);
}

function defaultImage(img)
{
    img.onerror = "";
    img.src = '/identicon?id='+img.dataset.rel;
}