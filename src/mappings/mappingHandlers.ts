
import { Campaign, Hero, HeroCampaign } from "../types";
import {AvalancheLog} from "@subql/types-avalanche";
import assert from "assert";
import { Expedition, FinishCampaignEvent, ParticipateEvent, ReinforceAttackEvent, ReinforceDefenseEvent, UnlockAttackNFTsEvent } from "../contracts/Expedition";
import { Expedition__factory } from "../contracts";
import { BigNumber } from "ethers";

async function createHero(tokenId: BigNumber, expedition: Expedition): Promise<Hero> {
  let hero = await Hero.get(tokenId.toHexString());

  // If the hero doesn't exist create the details
  if (!hero) {
    const [level, attack, defense, endurance] = await Promise.all([
      expedition.getNFTLevel(tokenId),
      expedition.getNFTAttack(tokenId),
      expedition.getNFTDefense(tokenId),
      expedition.getNFTEndurance(tokenId),
    ]);

    hero = Hero.create({
      id: tokenId.toHexString(),
      level: level.toBigInt(),
      attack: attack.toBigInt(),
      defense: defense.toBigInt(),
      endurance: endurance.toBigInt(),
    });

    await hero.save();
  }

  return hero;
}

export async function handleParticipate(event: AvalancheLog<ParticipateEvent['args']>): Promise<void> {

  assert(event.args, 'No event args');

  let campaign = await Campaign.get(event.args._id.toHexString());

  if (!campaign) {
    campaign = new Campaign(event.args._id.toHexString());
  }

  const expedition = Expedition__factory.connect(event.address, /* TODO need a provider injeccted globally */);

  let _reinforceTimestamps = campaign.reinforceTimestamps;

  // Get all the tokens
  const tokens = event.args._tokenIds;
  for (let i = 0; i < tokens.length; i++) {
    const tokenId = tokens[i];
    const hero = await createHero(tokenId, expedition);

    const heroCampaign = HeroCampaign.create({
      id: `${event.transactionHash}-${event.logIndex}-${tokenId.toHexString()}`,
      heroId: hero.id,
      campaignId: campaign.id,
      // not maker
      isAmbusher: !event.args._isMaker,
    })

    await heroCampaign.save();

    // Set campaign timestamps for each token
    _reinforceTimestamps.push(event.block.timestamp);
  }

  // Note: In the time event fired tier & area have already values so it's safe to retrieve here
  // Get campaign details from blockchain
  const campaignDetails = await expedition.campaigns(event.args._id);

  // Set tier and area info
  campaign.tier = campaignDetails.tier.toBigInt();
  campaign.area = campaignDetails.area.toBigInt();

  // if isMaker assign the sender as campaigner
  // store the tokens of campaigner or ambusher
  if (event.args._isMaker) {
    campaign.campaigner = event.args._sender;
    // set total defense
    campaign.totalDefense =event.args._points.toBigInt();

    // add timestamp
    campaign.startTimestamp = BigInt(event.block.timestamp.toString());
  } else {
    campaign.ambusher = event.args._sender;
    // set total attack
    campaign.totalAttack = event.args._points.toBigInt();
  }


  campaign.reinforceTimestamps = _reinforceTimestamps;
  await campaign.save();
}

export async function handleFinishCampaign(event: AvalancheLog<FinishCampaignEvent['args']>): Promise<void> {
  // Connect to the Expedition contract
  const expedition = Expedition__factory.connect(event.address, /* TODO need a provider injeccted globally */);

  const rewardMultiplier = await expedition.rewardMultiplier();
  const loserRewardMultiplier = BigNumber.from(10000).sub(rewardMultiplier);

  // Load campaign record
  let campaign = await Campaign.get(event.args._id.toHexString());

  // If the campaign does not exist create it with the campaign id
  if (!campaign) {
    campaign = new Campaign(event.args._id.toHexString());
  }

  // Caller is the maker
  // Set is claimed for the campaigner
  campaign.isClaimedCampaigner = true;

  // campaigner is the winner
  if (event.args._winner === event.args._sender) {
    campaign.rewardHonCampaigner = event.args._honReward.toBigInt();
    campaign.rewardHrmCampaigner = event.args._hrmReward.toBigInt();
    campaign.rewardHonAmbusher = BigInt(0);
    campaign.rewardHrmAmbusher = BigInt(0);
  } else {
    // ambusher is the winner
    campaign.rewardHonCampaigner = event.args._honReward
      .mul(loserRewardMultiplier)
      .div(BigNumber.from(10000))
      .toBigInt();
    campaign.rewardHrmCampaigner = event.args._hrmReward
      .mul(loserRewardMultiplier)
      .div(BigNumber.from(10000))
      .toBigInt();
    campaign.rewardHonAmbusher = event.args._honReward
      .mul(rewardMultiplier)
      .div(BigNumber.from(10000))
      .toBigInt();
    campaign.rewardHrmAmbusher = event.args._hrmReward
      .mul(rewardMultiplier)
      .div(BigNumber.from(10000))
      .toBigInt();
  }

  await campaign.save();
}

export async function handleUnlockAttackNFTs(event: AvalancheLog<UnlockAttackNFTsEvent['args']>): Promise<void> {
  // Load campaign record
  let campaign = await Campaign.get(event.args._id.toHexString());

  // If the campaign does not exist create it with the campaign id
  if (!campaign) {
    // This will cause issues as there is missing required params
    campaign = new Campaign(event.args._id.toHexString());
  }

  // Set is claimed for the ambusher
  campaign.isClaimedAmbusher = true;

  await campaign.save();
}

export async function handleReinforceAttack(event: AvalancheLog<ReinforceAttackEvent['args']>): Promise<void> {
  // Connect to the Expedition contract
  const expedition = Expedition__factory.connect(event.address, /* TODO need a provider injeccted globally */);

  // Load campaign record
  let campaign = await Campaign.get(event.args._id.toHexString());

  // If the campaign does not exist create it with the campaign id
  if (!campaign) {
    campaign = new Campaign(event.args._id.toHexString());
  }

  const tokenId = event.args._tokenId;
  const hero = await createHero(tokenId, expedition);

  // set the total attack points
  campaign.totalAttack = event.args._points.toBigInt();

  // Set campaign reinforcement timestamp
  let _reinforceTimestamps = campaign.reinforceTimestamps;
  _reinforceTimestamps.push(event.block.timestamp);

  // Create the heroCampaign record
  const heroCampaign = HeroCampaign.create({
    id: `${event.transactionHash}-${event.logIndex}`,
    heroId: hero.id,
    campaignId: campaign.id,
    // ambusher only calls reinforceAttack
    isAmbusher: true,
  })

  await heroCampaign.save();

  campaign.reinforceTimestamps = _reinforceTimestamps;
  await campaign.save();
}

export async function handleReinforceDefense(event: AvalancheLog<ReinforceDefenseEvent['args']>): Promise<void> {
  // Connect to the Expedition contract
  const expedition = Expedition__factory.connect(event.address, /* TODO need a provider injeccted globally */);

  // Load campaign record
  let campaign = await Campaign.get(event.args._id.toHexString());

  // If the campaign does not exist create it with the campaign id
  if (!campaign) {
    campaign = new Campaign(event.args._id.toHexString());
  }

  const tokenId = event.args._tokenId;
  const hero = await createHero(tokenId, expedition);

  // set the total defense points
  campaign.totalDefense = event.args._points.toBigInt();

  // Set campaign reinforcement timestamp
  let _reinforceTimestamps = campaign.reinforceTimestamps;
  _reinforceTimestamps.push(event.block.timestamp);

  // Create the heroCampaign record
  const heroCampaign = HeroCampaign.create({
    id: `${event.transactionHash}-${event.logIndex}`,
    heroId: hero.id,
    campaignId: campaign.id,
    // campaigner only calls reinforceDefense
    isAmbusher: false,
  })

  await heroCampaign.save();

  campaign.reinforceTimestamps = _reinforceTimestamps;
  campaign.save();
}

// export function handleOwnershipTransferred(event: OwnershipTransferred): void {}

// export function handlePaused(event: Paused): void {}

// export function handleUnpaused(event: Unpaused): void {}
