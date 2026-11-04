---
date: 2026-11-04
tickets: SEN-132
people: Yarden
status: active
---

# Openverse is used only to find Commons files; a Flickr or museum hit is turned down until its licence can be checked on its own page

**Why:** Openverse indexes Commons, Flickr's CC photos and museum collections. Its own licence field is a copy, and the licence line is legal, so every file is checked on its own page before it is kept (SEN-129). Only Commons has a page we can read that way: an Openverse hit on Commons is looked up by its page id and goes through the same licence filter as a Commons search hit.

We turned down a Flickr check (`flickr.photos.getInfo`) for now. It needs an API key, a new vendor, and a second licence parser on the legal line. For the drum grip, every hit Openverse returned was on Commons anyway.

The cost: a good Flickr or museum photo is still turned down. It is recorded as "licence cannot be checked on its own page yet", so the run record shows when this costs us a picture.
