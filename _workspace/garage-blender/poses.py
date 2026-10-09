"""Poses for the MakeHuman default rig, as world directions (person faces -Y, +X is their left).
Spine numbering is top-down in this rig: spine05 = pelvis end, spine01 = chest."""
from people_lib import aim, aim_chain, rot, twist

SPINE = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01']
NECK = ['neck01', 'neck02', 'neck03']


def arm(rig, s, upper, lower, hand=None):
    aim_chain(rig, [f'upperarm01.{s}', f'upperarm02.{s}'], upper)
    aim_chain(rig, [f'lowerarm01.{s}', f'lowerarm02.{s}'], lower)
    if hand:
        aim(rig, f'wrist.{s}', hand)


def leg(rig, s, thigh, shin, foot=None):
    aim_chain(rig, [f'upperleg01.{s}', f'upperleg02.{s}'], thigh)
    aim_chain(rig, [f'lowerleg01.{s}', f'lowerleg02.{s}'], shin)
    if foot:
        aim(rig, f'foot.{s}', foot)


def typing(rig):
    """sitting on a chair, forearms on the keyboard, looking down at the screen"""
    leg(rig, 'L', (0.1, -1, -0.04), (0.02, -0.22, -1), (0.0, -1, -0.45))
    leg(rig, 'R', (-0.08, -1, -0.02), (-0.04, -0.12, -1), (0.0, -1, -0.45))
    aim_chain(rig, SPINE, (0, -0.16, 1))
    aim_chain(rig, NECK, (0, -0.22, 1))
    aim(rig, 'head', (0, -0.1, 1))
    arm(rig, 'L', (0.5, -0.2, -0.9), (-0.85, -1, 0.45))
    arm(rig, 'R', (-0.5, -0.2, -0.9), (0.85, -1, 0.45))
    for s, k in (('L', 1), ('R', -1)):
        hand_on_keys(rig, s, k)


def hand_on_keys(rig, s, k):
    """palm down over the keys, fingers curled onto them, thumb resting on the space bar.
    k = +1 for the left hand (its outside is +X), -1 for the right"""
    # the rest pose holds the hand thumb-up (palm facing in): pronate the forearm, split over
    # both twist bones so the skin wraps instead of pinching at the wrist
    for b in (f'lowerarm01.{s}', f'lowerarm02.{s}'):
        twist(rig, b, TWIST * k)
    aim(rig, f'wrist.{s}', (-0.32 * k, -1, -0.1))
    # index -> pinky fan out a little; each finger arches over and comes down on its key
    for i, fan in ((2, -0.1), (3, -0.03), (4, 0.04), (5, 0.1)):
        f = (fan - 0.2) * k  # the hand carries on the forearm's inward line
        aim(rig, f'finger{i}-1.{s}', (f, -1, -0.2))
        aim(rig, f'finger{i}-2.{s}', (f * 0.6, -0.75, -0.66))
        aim(rig, f'finger{i}-3.{s}', (f * 0.3, -0.35, -0.94))
    # thumb: in under the hand, along the space bar
    aim(rig, f'finger1-1.{s}', (-0.55 * k, -0.75, -0.35))
    aim(rig, f'finger1-2.{s}', (-0.45 * k, -0.85, -0.3))
    aim(rig, f'finger1-3.{s}', (-0.35 * k, -0.9, -0.25))


TWIST = 45  # degrees per twist bone (left hand; mirrored for the right)


def clipboard(rig):
    """standing, weight on one leg, clipboard held against the chest, looking over"""
    leg(rig, 'L', (0.04, -0.12, -1), (0.0, 0.08, -1))
    leg(rig, 'R', (-0.02, 0.02, -1), (0.0, 0.0, -1))
    aim_chain(rig, SPINE, (0.03, 0.02, 1))
    arm(rig, 'R', (-0.1, -0.35, -0.93), (0.4, -0.85, 0.3), (0.5, -0.8, 0.0))
    arm(rig, 'L', (0.1, 0.03, -1), (0.06, -0.2, -1))
    aim_chain(rig, NECK, (-0.04, -0.08, 1))
    rot(rig, 'head', 'Z', 30)
    rot(rig, 'head', 'X', 9)
