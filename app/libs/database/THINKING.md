okay so my idea for this is basically so the syntax below also applies but I think we can make something different okay so first of all
instead of like defining component is a struct field maybe we can like define component is completely something different right so not a
component another struct but a component and component can have fields right similar to struct so a component is really similar to struct
but not a struct okay because in different than struct field component lets you also define methods inside of it and these methods are ways
to create instances of that component as a data okay I think this can make sense right yeah I mean I think I think this makes more sense
defining component is something different right but otherwise like without that like what if we were able to define any field as a component
right so in that case a component would be made out of one field right and it can have constructors or creators whatever that's also a
possibility but I mean more flexible ish but I mean it just changes the syntax I mean it just changes the syntax so I don't think we have we
don't we need to so I don't think we have we don't we need to do it like that I don't think we have to do it like that so a component is
going do it like that I don't think we have to do it like that so a component is going to use struct stuff internally okay so it's gonna be
really similar to start it to use struct stuff internally okay so it's gonna be really similar to start it is gonna use struct field
internally probably anyway right but a component is is gonna use struct field internally probably anyway right but a component is basically
something different okay a component is a way to create the values basically something different okay a component is a way to create the
values okay also component is a way to like carry those values and etc using the okay also component is a way to like carry those values and
etc using the reference as type a component has a name right that can be represented on the reference as type a component has a name right
that can be represented on the database on the own story database on the own story on the own story I guess

## Syntax

```ts
const Position = Component({
    name: "position",
    shape: Vector3,
    zero() {
        return { x: 0, y: 0, z: 0 };
    },
});

const Player = Tag("player");
const Banned = Tag("banned");

const entity = await nest.create(
    Player,
    Position.create({ x: 0, y: 0, z: 0 }),
);

await nest.exist(entity); // true
await nest.destroy(entity);
await nest.exist(entity); // false

const query = nest
    .withAll(Player, Position)
    .withNone(Banned)
    .build();

const Health = Component({
    name: "health",
    shape: { value: IntegerField() }, // shape or struct field
});

await nest.add(entity, Health.of(100));
await nest.set(entity, Health.of(50));
await nest.remove(entity, Health);

await query.toArray();
for (const chunk of query) {}

await query.filter(({ ref }) => ({
    name: { OR: [{ eq: "mike" }, { eq: "joe" }] },
    age: { gte: 18 },
    boss: { has: { age: { gte: 60 } } },
    [ref(GroupMember).by("user")]: {
        has: {
            role: { eq: "foo" },
        },
    },
}));

// or maybe, hmm i was thinking and uhh maybe
await nest.query(({ ref, with, all, any, none }) => all(
    with(User).has({
        name: { ANY: [{ eq: "mike" }, { eq: "joe" }] },
        age: { gte: 18 },
        boss: { has: { age: { gte: 60 } } },
    }),
    ref(GroupMember).by("user").has({
        role: { eq: "foo" },
    }),
));

// or even with more seperated components
await nest.query(({ ref, with, all, any, none }) => all(
    with(User), // tag
    any(with(HasName).of({ eq: "mike" }), with(HasName).of({ eq: "joe" })),
    with(HasAge).of({ gte: 18 }), // .of() only exists for the single field components
    with(HasBoss).has({ user: with(HasAge).of({ gte: 60 }) }),
    ref(GroupMember).by("user").has({
        role: { eq: "foo" },
    }),
));

await nest.query(({ ref, with, all, any, none }) => all(
    with(User), // tag
    any(with(HasName).of({ eq: "mike" }), with(HasName).of({ eq: "joe" })),
    with(HasAge).of({ gte: 18 }), // .of() only exists for the single field components
    with(HasBoss).of(with(HasAge).of({ gte: 60 })),
    ref(GroupMember).by("user").has({
        role: { eq: "foo" },
    }),
));

await nest.query(({ ref, with, all, any, none }) => all(
    with(User), // tag
    any(with(HasName).of({ eq: "mike" }), with(HasName).of({ eq: "joe" })),
    with(HasAge).of({ gte: 18 }), // .of() only exists for the single field components
    with(HasBoss).of(all(with(HasAge).of({ gte: 60 }), with(HasName).of({ eq: "john" }))),
    ref(GroupMember).by("user").has({
        role: { eq: "foo" },
    }),
));
```
