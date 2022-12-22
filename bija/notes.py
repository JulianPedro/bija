import json

from bija.app import app
from bija.db import BijaDB

DB = BijaDB(app.session)


class FeedThread:
    def __init__(self, notes):
        self.notes = notes
        self.threads = []
        self.roots = []
        self.ids = set()
        self.last_ts = None

        self.get_roots()
        self.build()

    def get_roots(self):
        roots = []
        for note in self.notes:
            note = dict(note)
            self.last_ts = note['created_at']
            if note['thread_root'] is not None:
                roots.append(note['thread_root'])
                self.add_id(note['thread_root'])
            elif note['response_to'] is not None:
                roots.append(note['response_to'])
                self.add_id(note['response_to'])
            elif note['thread_root'] is None and note['response_to'] is None:
                roots.append(note['id'])
                self.add_id(note['id'])

        self.roots = list(dict.fromkeys(roots))

    def add_id(self, note_id):
        if note_id not in self.ids:
            self.ids.add(note_id)

    def build(self):
        for root in self.roots:
            t = self.build_thread(root)
            self.threads.append(t)

    def build_thread(self, root):
        t = {'self': None, 'id': root, 'response': None, 'responders': {}}
        responders = []
        for _note in self.notes:
            note = dict(_note)

            is_root, is_response = self.is_in_thread(note, root)
            if is_root:
                self.notes.remove(_note)
                t['self'] = note
            elif is_response:
                self.notes.remove(_note)
                if t['response'] is None:
                    t['response'] = note
                if len(t['responders']) < 2:
                    t['responders'][note['public_key']] = note['name']
                responders.append(note['public_key'])

            if (is_root or is_response) and note['reshare'] is not None:
                reshare = DB.get_note(note['reshare'])
                self.add_id(note['reshare'])
                if reshare is not None:
                    note['reshare'] = reshare

        responders = list(dict.fromkeys(responders))
        t['responder_count'] = len(responders)

        if t['self'] is None:
            t['self'] = DB.get_note(root)
        return t

    @staticmethod
    def is_in_thread(note, root):
        is_root = False
        is_response = False
        if note['id'] == root:
            is_root = True
        elif note['response_to'] == root or note['thread_root'] == root:
            is_response = True
        return is_root, is_response


class NoteThread:
    def __init__(self, note_id):
        self.id = note_id
        self.is_root = False
        self.root = []
        self.root_id = note_id
        self.note = self.get_note()
        self.ancestors = []
        self.children = []
        self.note_ids = [self.id]
        self.public_keys = []
        self.profiles = []
        self.determine_root()
        self.notes = self.get_notes()
        self.process()
        self.get_profile_briefs()
        self.result_set = self.root+self.ancestors+[self.note]+self.children

    def process(self):

        self.get_children()

        if not self.is_root:
            self.get_root()

        if self.note is not None and type(self.note) == dict and self.note['response_to'] is not None:
            self.get_ancestor(self.note['response_to'])

        if len(self.children) > 0 and type(self.note) == dict:
            self.note['class'] = self.note['class'] + ' ancestor'

        if len(self.root) > 0 and type(self.root[0]) == dict:
            self.root[0]['class'] = self.root[0]['class'] + ' ancestor'

    def get_note(self):
        n = DB.get_note(self.id)
        if n is not None:
            n = dict(n)
            n['current'] = True
            if n['thread_root'] is None:
                self.is_root = True
                n['class'] = 'main root'
            else:
                self.is_root = False
                n['class'] = 'main'
            return n
        return self.id

    def get_notes(self):
        return DB.get_note_thread(self.root_id)

    def get_children(self):
        to_remove = []
        for note in self.notes:
            n = dict(note)
            if n['response_to'] == self.id or (n['thread_root'] == self.id and n['response_to'] is None):
                self.children.append(n)
                self.add_members(n)
                to_remove.append(note)
                n['reshare'] = self.get_reshare(n)
                n['class'] = 'reply'
                self.note_ids.append(n['id'])
        self.remove_notes_from_list(to_remove)

    def remove_notes_from_list(self, notes: list):
        for n in notes:
            self.notes.remove(n)

    def get_ancestor(self, note_id):
        to_remove = []
        found = False
        for note in self.notes:
            n = dict(note)
            if n['id'] == note_id:
                self.ancestors.append(n)
                self.add_members(n)
                to_remove.append(note)
                self.note_ids.insert(0, n['id'])
                n['reshare'] = self.get_reshare(n)
                n['class'] = 'ancestor'
                if n['response_to'] is not None:
                    self.get_ancestor(n['response_to'])
                found = True
                break
        if not found:
            self.ancestors.append(note_id)
        self.remove_notes_from_list(to_remove)

    def get_root(self):
        for note in self.notes:
            n = dict(note)
            if n['id'] == self.root_id:
                self.root = [n]
                self.add_members(n)
                self.notes.remove(note)
                self.note_ids.append(n['id'])
                n['class'] = 'root'
                n['reshare'] = self.get_reshare(n)
                break

    def get_reshare(self, note):
        if note['reshare'] is not None:
            reshare = DB.get_note(note['reshare'])
            if reshare is not None:
                return reshare
        return None

    def determine_root(self):
        if self.note is not None and type(self.note) == dict:
            if self.note['thread_root'] is not None:
                self.root_id = self.note['thread_root']

    def add_public_keys(self, public_keys: list):
        for k in public_keys:
            if k not in self.public_keys:
                self.public_keys.append(k)

    def get_profile_briefs(self):
        self.profiles = DB.get_profile_briefs(self.public_keys)

    def add_members(self, note):
        public_keys = [note['public_key']]
        public_keys = json.loads(note['members']) + public_keys
        self.add_public_keys(public_keys)
